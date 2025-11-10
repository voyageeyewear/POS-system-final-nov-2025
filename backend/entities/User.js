const { EntitySchema } = require('typeorm');
const bcrypt = require('bcryptjs');

module.exports = new EntitySchema({
  name: 'User',
  tableName: 'users',
  columns: {
    id: {
      type: 'int',
      primary: true,
      generated: true,
    },
    name: {
      type: 'varchar',
      nullable: false,
    },
    email: {
      type: 'varchar',
      unique: true,
      nullable: false,
      transformer: {
        to: (value) => value?.toLowerCase(),
        from: (value) => value,
      },
    },
    password: {
      type: 'varchar',
      nullable: false,
      select: false, // Don't include in default queries
    },
    role: {
      type: 'enum',
      enum: ['admin', 'cashier'],
      default: 'cashier',
    },
    assignedStoreId: {
      type: 'int',
      nullable: true,
    },
    isActive: {
      type: 'boolean',
      default: true,
    },
    createdAt: {
      type: 'timestamp',
      createDate: true,
    },
    updatedAt: {
      type: 'timestamp',
      updateDate: true,
    },
  },
  relations: {
    assignedStore: {
      type: 'many-to-one',
      target: 'Store',
      joinColumn: { name: 'assignedStoreId' },
      nullable: true,
      onDelete: 'SET NULL', // Set to NULL when store is deleted
    },
  },
});

// Helper methods for User entity
class UserMethods {
  static async hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  }

  static async comparePassword(candidatePassword, hashedPassword) {
    return await bcrypt.compare(candidatePassword, hashedPassword);
  }

  static toJSON(user) {
    const { password, ...userWithoutPassword } = user;
    
    // Ensure assignedStore has proper id field for frontend compatibility
    if (userWithoutPassword.assignedStore) {
      userWithoutPassword.assignedStore = {
        ...userWithoutPassword.assignedStore,
        id: userWithoutPassword.assignedStore.id,
        _id: userWithoutPassword.assignedStore.id, // For backwards compatibility
      };
    }
    
    return userWithoutPassword;
  }
}

module.exports.UserMethods = UserMethods;

