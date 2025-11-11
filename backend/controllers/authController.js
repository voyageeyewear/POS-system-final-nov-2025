const jwt = require('jsonwebtoken');
const { AppDataSource } = require('../data-source');
const { UserMethods } = require('../entities/User');

// Get User repository
const getUserRepository = () => AppDataSource.getRepository('User');
const getStoreRepository = () => AppDataSource.getRepository('Store');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Register new user (Admin only)
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, assignedStore } = req.body;
    const userRepo = getUserRepository();

    // Check if user already exists
    const existingUser = await userRepo.findOne({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await UserMethods.hashPassword(password);

    const user = userRepo.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role || 'cashier',
      assignedStoreId: assignedStore || null
    });

    await userRepo.save(user);
    
    // Return user without password
    const userResponse = UserMethods.toJSON(user);
    
    res.status(201).json({
      message: 'User created successfully',
      user: userResponse
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Auto-sync tracker
let lastSyncTime = null;
let isSyncing = false;

// Background sync function
const triggerBackgroundSync = async (forceSync = false) => {
  if (isSyncing) {
    console.log('⏭️ Sync already in progress, skipping...');
    return;
  }

  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  
  // Only sync if last sync was more than 1 hour ago (unless forced)
  if (!forceSync && lastSyncTime && (now - lastSyncTime) < ONE_HOUR) {
    console.log(`⏭️ Skipping sync - last sync was ${Math.round((now - lastSyncTime) / 1000 / 60)} minutes ago`);
    return;
  }

  isSyncing = true;
  console.log('🔄 Starting background auto-sync...');

  try {
    const dataManagementController = require('./dataManagementController');
    
    // Create a mock request/response for the sync
    const mockReq = {};
    const mockRes = {
      json: (data) => {
        console.log('✅ Background sync completed:', data);
        lastSyncTime = Date.now();
        isSyncing = false;
      },
      status: (code) => ({
        json: (data) => {
          console.error('❌ Background sync failed:', data);
          console.error('❌ Error details:', data);
          isSyncing = false;
          return { json: () => {} };
        }
      })
    };

    await dataManagementController.refreshData(mockReq, mockRes);
  } catch (error) {
    console.error('❌ Background sync error:', error);
    console.error('❌ Stack trace:', error.stack);
    isSyncing = false;
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const userRepo = getUserRepository();

    // Find user with password field
    const user = await userRepo.findOne({
      where: { email: email.toLowerCase() },
      relations: ['assignedStore'],
      select: ['id', 'name', 'email', 'password', 'role', 'assignedStoreId', 'isActive', 'createdAt', 'updatedAt']
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    // Check password
    const isMatch = await UserMethods.comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user.id);

    // Return user without password
    const userResponse = UserMethods.toJSON(user);

    // Trigger background sync (non-blocking) - Force sync if never synced before
    const shouldForceSync = !lastSyncTime;
    setImmediate(() => {
      triggerBackgroundSync(shouldForceSync).catch(err => {
        console.error('Background sync trigger error:', err);
      });
    });

    res.json({
      message: 'Login successful',
      token,
      user: userResponse,
      syncStatus: lastSyncTime 
        ? `Last synced ${Math.round((Date.now() - lastSyncTime) / 1000 / 60)} minutes ago`
        : 'Syncing data in background...'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get sync status
exports.getSyncStatus = async (req, res) => {
  try {
    const status = {
      isSyncing,
      lastSyncTime,
      lastSyncAgo: lastSyncTime 
        ? `${Math.round((Date.now() - lastSyncTime) / 1000 / 60)} minutes ago`
        : 'Never',
      message: isSyncing 
        ? 'Syncing data from Shopify...'
        : lastSyncTime 
          ? 'Data is up to date'
          : 'Waiting for first sync'
    };
    res.json(status);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Update user
exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    const userRepo = getUserRepository();

    console.log('🔄 UPDATE USER REQUEST:', {
      userId,
      updates,
      assignedStoreId: updates.assignedStoreId
    });

    // Don't allow password update through this endpoint
    delete updates.password;

    const user = await userRepo.findOne({
      where: { id: parseInt(userId) },
      relations: ['assignedStore']
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('📝 BEFORE UPDATE:', {
      userEmail: user.email,
      currentStoreId: user.assignedStoreId,
      currentStore: user.assignedStore?.name
    });

    // Update user fields
    Object.assign(user, updates);
    
    console.log('📝 AFTER ASSIGN:', {
      userEmail: user.email,
      newStoreId: user.assignedStoreId
    });
    
    const savedUser = await userRepo.save(user);
    
    console.log('✅ AFTER SAVE:', {
      userEmail: savedUser.email,
      savedStoreId: savedUser.assignedStoreId
    });
    
    // Reload with relations to ensure assignedStore is loaded
    const updatedUser = await userRepo.findOne({
      where: { id: savedUser.id },
      relations: ['assignedStore']
    });

    console.log('✅ RELOADED USER:', {
      userEmail: updatedUser.email,
      finalStoreId: updatedUser.assignedStoreId,
      finalStore: updatedUser.assignedStore?.name
    });

    const userResponse = UserMethods.toJSON(updatedUser);

    res.json({ message: 'User updated successfully', user: userResponse });
  } catch (error) {
    console.error('❌ UPDATE USER ERROR:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get all users (Admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const userRepo = getUserRepository();
    const users = await userRepo.find({
      relations: ['assignedStore'],
      order: { createdAt: 'DESC' }
    });

    const usersResponse = users.map(user => UserMethods.toJSON(user));
    
    res.json({ users: usersResponse });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete user (Admin only)
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const userRepo = getUserRepository();
    
    const user = await userRepo.findOne({ where: { id: parseInt(userId) } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await userRepo.remove(user);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
