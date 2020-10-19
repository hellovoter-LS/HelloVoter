module.exports = {
  id: {
    type: 'uuid',
    primary: true
  },
  amount: {
    type: 'integer',
    required: true
  },
  status: {
    type: 'string',
    default: 'pending'
  },
  disbursed_at: {
    type: 'localdatetime',
    required: false
  },
  settled_at: {
    type: 'localdatetime',
    required: false
  },
  disbursement_id: {
    type: 'string',
    required: false
  },
  settlement_id: {
    type: 'string',
    required: false
  },
  error: {
    type: 'string',
    required: false
  },
  to_account: {
    type: 'node',
    relationship: 'TO_ACCOUNT',
    direction: 'out',
    target: 'Account',
    cascade: 'detach',
    eager: true
  }
};
