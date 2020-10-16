import { serializeAmbassador, serializeTriplerForCSV, serializeTripler, serializePayout, serializeName, serializeTripleeForCSV } from '../routes/api/v1/va/serializers';
import { ov_config } from '../lib/ov_config';

async function exportAmbassadors(neode) {
  let collection = await neode.model('Ambassador').all();
  let text = '';

  for (let x = 0; x < collection.length; x++) {
    let entry = collection.get(x);
    let ambassador = serializeAmbassador(entry);
    let triplers = entry.get('claims');
    let unconfirmed = 0;
    let pending = 0;
    let confirmed = 0;

    for (let y = 0; y < triplers.length; y++) {
      let tripler = triplers.get(y).otherNode();
      if (tripler.get('status') === 'unconfirmed') {
        unconfirmed++;
      } else if (tripler.get('status') === 'confirmed') {
        confirmed++;
      } else if (tripler.get('status') === 'pending') {
        pending++;
      }
    }

    let payouts = entry.get('gets_paid');
    let total_sent_to_bank = 0;
    let total_earned = 0;
    let disbursed = 0;
    let settled = 0;

    for (let z = 0; z < payouts.length; z++) {
      let payout = payouts.get(z).otherNode();

      if (payout.get('status') === 'disbursed') {
        disbursed++;
      } else if (payout.get('status') === 'settled') {
        settled++;
        total_sent_to_bank += ov_config.payout_per_tripler / 100;
      }
      total_earned += ov_config.payout_per_tripler / 100;
    }

    let ambassador_line = [
      ambassador.external_id,
      new Date(entry.get('created_at')),
      ambassador.date_of_birth,
      ambassador.first_name,
      ambassador.last_name,
      ambassador.address.address1.replace(',', ' ').replace('#', 'no.'),
      ambassador.address.zip,
      ambassador.email,
      ambassador.phone,
      unconfirmed,
      pending,
      confirmed,
      total_sent_to_bank,
      total_earned
    ].join(',');

    let header_line = [
      'Google/FB ID',
      'Created at',
      'Date of Birth',
      'First Name',
      'Last Name',
      'Street Address',
      'Zip Code',
      'Email',
      'Phone',
      'Unconfirmed',
      'Pending',
      'Confirmed',
      'Total Sent to Bank',
      'Total Earned'
    ];

    if (x === 0) {
      text = text + header_line;
    }

    text = text + '\n' + ambassador_line;
  }

  return text;
}

async function exportTriplers(neode) {
  let collection = await neode.model('Ambassador').all();
  let text = '';
  for (let x = 0; x < collection.length; x++) {
    let entry = collection.get(x);
    let ambassador = serializeAmbassador(entry);
    let relationships = entry.get('claims');

    let header_line = [
        'Voter ID',
        'First Name',
        'Last Name',
        'Street',
        'Zip',
        'Status',
        'Date Claimed',
        'Date Confirmed',
        'Ambassador Name',
        'Ambassador External ID',
        'Phone',
        'DOB entry',
        'Triplee1',
        'Triplee2',
        'Triplee3',
        
    ];

    if (x === 0) {
      text = text + header_line;
    }

    for (let y = 0; y < relationships.length; y++) {
      let relationship = relationships.get(y);
      let entry = relationship.otherNode();
      let tripler = serializeTriplerForCSV(entry);
      let tripler_line = [
        tripler.voter_id,
        tripler.first_name,
        tripler.last_name,
        tripler.address.address1.replace(',', ' ').replace('#', 'no.'),
        tripler.address.zip,
        tripler.status,
        new Date(relationship.get('since')),
        entry.get('confirmed_at')? new Date(entry.get('confirmed_at')) : '',
        serializeName(ambassador.first_name, ambassador.last_name),
        ambassador.external_id,
        tripler.phone,
        tripler.dob_entry,
        tripler.triplees ? tripler.triplees[0].first_name ? serializeTripleeForCSV(tripler.triplees[0]) : tripler.triplees[0] : '',
        tripler.triplees ? tripler.triplees[0].first_name ? serializeTripleeForCSV(tripler.triplees[1]) : tripler.triplees[1] : '',
        tripler.triplees ? tripler.triplees[0].first_name ? serializeTripleeForCSV(tripler.triplees[2]) : tripler.triplees[2] : '',
      ];

      text = text + '\n' + tripler_line;
    }
  }

  return text;
}

module.exports = {
  exportAmbassadors: exportAmbassadors,
  exportTriplers: exportTriplers
}

