let enforceUnique = process.env.STRESS_TESTING !== 'true';

module.exports = {
  id: {
    type: 'uuid',
    primary: true
  },
  external_id: {
    type: 'string',
    unique: enforceUnique
  },
  first_name: {
    type: 'string',
    required: true
  },
  last_name: {
    type: 'string',
    required: true
  },
  date_of_birth: 'string',
  phone: {
    type: 'string',
    unique: enforceUnique,
    required: true
  },
  email: {
    type: 'string',
    unique: enforceUnique
  },
  address: {
    type: 'string',
    required: true
  },
  location: {
    type: 'point',
    required: true
  },
  claims: {
    type: 'relationships',
    relationship: 'CLAIMS',
    direction: 'out',
    target: 'Tripler',
    properties: {
      since: {
        type: 'localdatetime',
        default: () => new Date,
      },
    dob_entry: {
      type: 'string',
      default: 'Not provided'
        },
    },
    eager: true
  },
  signup_completed: {
    type: 'boolean',
    default: false
  },
  onboarding_completed: {
    type: 'boolean',
    default: false
  },
  approved: {
    type: 'boolean',
    default: false
  },
  quiz_results: 'string',
  created_at: {
    type: 'localdatetime',
    default: () => new Date,
  },
  locked: {
    type: 'boolean',
    default: false
  },
  payout_provider: 'string',
  admin: {
    type: 'boolean',
    default: false
  },
  gets_paid: {
    type: 'relationships',
    relationship: 'GETS_PAID',
    direction: 'out',
    target: 'Payout',
    properties: {
      since: {
        type: 'localdatetime',
        default: () => new Date,
      },
      tripler_id: 'uuid'
    },
    eager: true
  },
  first_reward: {
    type: 'relationships',
    relationship: 'FIRST_REWARD',
    direction: 'out',
    target: 'Payout',
    properties: {
      since: {
        type: 'localdatetime',
        default: () => new Date,
      },
      tripler_id: 'uuid'
    },
    eager: true
  },
  owns_account: {
    type: 'relationships',
    relationship: 'OWNS_ACCOUNT',
    direction: 'out',
    target: 'Account',
    properties: {
      since: {
        type: 'localdatetime',
        default: () => new Date,
      }
    },
    eager: true
  },
  was_once: {
    type: 'relationship',
    relationship: 'WAS_ONCE',
    direction: 'out',
    target: 'Tripler',
    properties: {
      rewarded_previous_claimer: 'boolean',
      since: {
        type: 'localdatetime',
        default: () => new Date
      }
    },
    eager: true
  },
  verification: 'string',
  carrier_info: 'string'
};

