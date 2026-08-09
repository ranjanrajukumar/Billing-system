import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

const partyTypes = ['Customer', 'Supplier'];
// 'Gave' means value handed to the party, so they owe you more.
// 'Got' means value received back from them, reducing what they owe.
const entryTypes = ['Gave', 'Got'];

export default (sequelize) => sequelize.define('KhataEntry', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  partyType: { ...enumType(sequelize, partyTypes), allowNull: false },
  partyId: { type: DataTypes.INTEGER, allowNull: false },
  entryDate: { type: DataTypes.DATEONLY, allowNull: false },
  entryType: { ...enumType(sequelize, entryTypes), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  note: { type: DataTypes.STRING(255) },
  dueDate: { type: DataTypes.DATEONLY },
  // Optional photo of a bill or receipt, stored like every other image here.
  attachmentData: { type: DataTypes.BLOB('long') },
  attachmentMimeType: { type: DataTypes.STRING(100) },
  // Served from the authenticated API, not /media, because bill photos are
  // private to the user who recorded the entry.
  attachmentUrl: {
    type: DataTypes.VIRTUAL,
    get() { return this.attachmentMimeType ? `/khata/entries/${this.id}/attachment` : null; }
  },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'khata_entries',
  // Attachment bytes are only needed by the media endpoint.
  defaultScope: { attributes: { exclude: ['attachmentData'] } },
  indexes: [{ fields: ['party_type', 'party_id'] }, { fields: ['entry_date'] }]
});
