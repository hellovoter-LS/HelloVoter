let enforceUnique = process.env.STRESS_TESTING !== 'true';

module.exports = {
  id: {
    type: 'uuid',
    primary: true
  },
  voter_id: {
    type: 'string',
    unique: enforceUnique
  },
  first_name: {
    type: 'string',
    required: true
  },
  last_name: 'string',
  date_of_birth: 'string',
  phone: {
    type: 'string',
    unique: enforceUnique
  },
  email: 'string',  
  status: 'string',
  confirmed_at: 'localdatetime',
  upgrade_sms_sent: {
    type: 'boolean',
    default: false
  },
  address: {
    type: 'string',
    required: true
  },
  location: {
    type: 'point',
    required: true
  },
  triplees: 'string',
  created_at: {
    type: 'localdatetime',
    default: () => new Date,
  },
  knows: {
    type: 'relationships',
    relationship: 'KNOWS',
    target: 'Tripler',
    properties: {
      distance: {
        type: 'float'
      }
    },
    eager: true,
    cascade: 'detach'
  },
  claimed: {
    type: 'node',
    target: 'Ambassador',
    relationship: 'CLAIMS',
    direction: 'in',
    eager: true,
    cascade: 'detach'
  },
  is_ambassador: {
    type: 'node',
    target: 'Ambassador',
    relationship: 'WAS_ONCE',
    eager: true,
    cascade: 'detach'
  },
  is_ambassador_and_has_confirmed: {
    type: 'boolean',
    default: false
  },
  verification: 'string',
  carrier_info: 'string',
  blocked_carrier_info: 'string'
};
