const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'Product',
  tableName: 'products',
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
    sku: {
      type: 'varchar',
      unique: true,
      nullable: false,
    },
    category: {
      type: 'enum',
      enum: ['frame', 'eyeglass', 'sunglass', 'accessory'],
      nullable: false,
    },
    price: {
      type: 'decimal',
      precision: 10,
      scale: 2,
      nullable: false,
    },
    taxRate: {
      type: 'int',
      default: 18,
    },
    description: {
      type: 'text',
      default: '',
    },
    image: {
      type: 'varchar',
      default: '',
    },
    shopifyProductId: {
      type: 'varchar',
      nullable: true,
    },
    shopifyVariantId: {
      type: 'varchar',
      nullable: true,
    },
    inventoryItemId: {
      type: 'varchar',
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
    inventory: {
      type: 'one-to-many',
      target: 'Inventory',
      inverseSide: 'product',
    },
  },
});

