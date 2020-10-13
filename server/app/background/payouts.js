import logger from 'logops';

import ambassadorSvc from '../services/ambassadors';
import triplerSvc from '../services/triplers';
import stripeSvc from '../services/stripe';
import paypalSvc from '../services/paypal';
import fifo from '../lib/fifo';

function disburse_task(ambassador, tripler) {
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

function settle_task(ambassador, tripler) {
  return {
    name: `Settle ambassador: ${ambassador.get('phone')} for tripler: ${tripler.get('phone')}`,
    execute: async () => {
      try {
        logger.debug('Trying settlement for ambassador (%s) for tripler (%s)', ambassador.get('phone'), tripler.get('phone'));
        let account = await ambassadorSvc.getPrimaryAccount(ambassador);
        if (account.get('account_type') === 'stripe') {
          await stripeSvc.settle(ambassador, tripler);
        }
      }
      catch(err) {
        logger.error('Error settling for ambassador (%s) for tripler (%s): %s', ambassador.get('phone'), tripler.get('phone'), err);
      }
    },
  };
}

async function disburse() {
  logger.debug('Disbursing amount to ambassadors...');

  let ambassadors = await ambassadorSvc.findAmbassadorsWithPendingDisbursements();
  logger.debug('%d ambassadors to be processed for disbursement', ambassadors.length);

  await Promise.all(ambassadors.map(async(ambassador) => {
    await Promise.all(ambassador.get('gets_paid').map(async(relationship) => {
      let tripler = await triplerSvc.findById(relationship.get('tripler_id'));
      if (tripler && relationship.otherNode().get('status') === 'pending') {
        fifo.add(disburse_task(ambassador, tripler));
      }
    }));
  }));
}

async function settle() {
  logger.debug('Settling for ambassadors...');

  let ambassadors = await ambassadorSvc.findAmbassadorsWithPendingSettlements();
  logger.debug('%d ambassadors to be processed for settlement', ambassadors.length);

  await Promise.all(ambassadors.map(async(ambassador) => {
    await Promise.all(ambassador.get('gets_paid').map(async(relationship) => {
      let tripler = await triplerSvc.findById(relationship.get('tripler_id'));
      if (tripler && relationship.otherNode().get('status') === 'disbursed') {
        fifo.add(settle_task(ambassador, tripler));
      }
    }));
  }));
}

module.exports = () => {
  logger.debug('Send payouts/retrying payouts');

  setTimeout(async() => {
    try {
      await disburse();
      // await settle();
    } catch(err) {
      logger.error('Error in payouts background job: %s', err);
    }
  });
}
