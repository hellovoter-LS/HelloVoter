import logger from 'logops';

import ambassadorSvc from '../services/ambassadors';
import triplerSvc from '../services/triplers';
import stripeSvc from '../services/stripe';
import paypalSvc from '../services/paypal';
import fifo from '../lib/fifo';
import { ov_config } from '../lib/ov_config';
import neode from '../lib/neode';

async function disburse_task(ambassador, tripler) {
  return {
    name: `Disbursing ambassador: ${ambassador.get('phone')} for tripler: ${tripler.get('phone')}`,
    execute: async () => {
      try {
        logger.debug('Trying disbursement for ambassador (%s) for tripler (%s)', ambassador.get('phone'), tripler.get('phone'));
        let account = await ambassadorSvc.getPrimaryAccount(ambassador);
        if (!account) return;
        if (account.get('account_type') === 'stripe') {
          await stripeSvc.disburse(ambassador, tripler);
        } else if (account.get('account_type') === 'paypal') {
          await paypalSvc.disburse(ambassador, tripler);
        }
      }
      catch(err) {
        logger.error('Error sending disbursement for ambassador (%s) for tripler (%s): %s', ambassador.get('phone'), tripler.get('phone'), err);
      }
    },
  };
}

async function disburse() {
  logger.debug('Disbursing amount to ambassadors...');

  let query = `MATCH (:Account)<-[:OWNS_ACCOUNT]-(a:Ambassador {approved: true})-[gp:GETS_PAID]->(:Payout {status: 'pending'}) RETURN a.id, gp.tripler_id LIMIT ${ov_config.payout_batch_size}`;

  let res = await neode.cypher(query);

  if (res.records.length > 0) {
    logger.debug('%d ambassadors to be processed for disbursement', res.records.length);
    for(var x = 0; x < res.records.length; x++) {
      let record = res.records[x];
      let ambassador_id = record._fields[0];
      let tripler_id = record._fields[1];
      let ambassador = await ambassadorSvc.findById(ambassador_id);
      let tripler = await triplerSvc.findById(tripler_id);
      if (ambassador && tripler) {
        fifo.add(await disburse_task(ambassador, tripler));
      }
    }
  }
}

module.exports = () => {
  logger.debug('Send payouts/retrying payouts');

  setTimeout(async() => {
    try {
      await disburse();
    } catch(err) {
      logger.error('Error in payouts background job: %s', err);
    }
  });
}
