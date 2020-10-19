import logger from 'logops';
const paypal = require('@paypal/payouts-sdk');
import neo4j from 'neo4j-driver';

import neode from '../lib/neode';
import { ov_config } from '../lib/ov_config';

let client = null;

// Only initialize PayPal if env vars are set up.
if (ov_config.paypal_environment) {
  const environment = ov_config.paypal_environment === 'sandbox'
    ? new paypal.core.SandboxEnvironment(ov_config.paypal_client_id, ov_config.paypal_client_secret)
    : new paypal.core.LiveEnvironment(ov_config.paypal_client_id, ov_config.paypal_client_secret);

  client = new paypal.core.PayPalHttpClient(environment);
}

function validateForPayment(ambassador, tripler) {
  if (!ambassador.get('approved')) {
    throw 'Ambassador not approved, cannot pay';
  }

  if (ambassador.get('locked')) {
    throw 'Ambassador locked, cannot pay';
  }

  let obj = tripler.get('claimed');
  if (!obj || !obj || obj.get('id') !== ambassador.get('id')) {
    throw 'Tripler not claimed by the ambassador, cannot pay';
  }

  let status = tripler.get('status');
  if (status !== 'confirmed') {
    throw 'Tripler not confirmed yet, cannot pay';
  }
}

function getPaypalAccount(ambassador) {
  let payout_account = null;

  ambassador.get('owns_account').forEach((entry) => {
   if (entry.otherNode().get('account_type') === 'paypal' && entry.otherNode().get('is_primary')) {
      payout_account = entry.otherNode();
    }
  });

  if (payout_account) return payout_account;
  throw 'Paypal account not set for ambassador, cannot pay';
}

async function disburse(ambassador, tripler) {
  // pending => disbursed => settled

  validateForPayment(ambassador, tripler);

  let query = `MATCH (:Ambassador{id: \'${ambassador.get('id')}\'})-[:GETS_PAID {tripler_id: \'${tripler.get('id')}\'}]->(p:Payout{status: \'pending\'}) RETURN p.id`;
  let res = await neode.cypher(query);
  if (res.records.length === 0) {
    return;
  }

  let payout_id = res.records[0]._fields[0];
  let payout = await neode.first('Payout', 'id', payout_id);

  let amount = parseInt(ov_config.payout_per_tripler);

  if (!amount) {
    throw 'Configuration error, cannot pay';
  }

  let payout_account = getPaypalAccount(ambassador);
  if (!payout_account) {
    throw 'Paypal account not set for ambassador, cannot pay';
  }

  let transfer = null;

  try {
    logger.debug('disbursing to ambassador %s due to tripler %s', ambassador.get('id'), tripler.get('id'));
    let requestBody = {
      "sender_batch_header": {
        "recipient_type": "EMAIL",
        "email_message": "Ambassador payment",
        "note": "",
        "sender_batch_id": new Date(),
        "email_subject": "This is a paypal transaction"
      },
      "items": [{
        "note": "",
        "amount": {
          "currency": "USD",
          "value": amount / 100
        },
        "receiver": ambassador.get('email'),
        "sender_item_id": new Date()
      }]
    }

    let request = new paypal.payouts.PayoutsPostRequest();
    request.requestBody(requestBody);

    transfer = await client.execute(request);
  } catch(err) {
    await payout.update({ error: JSON.stringify(err) });
    throw err;
  }

  // update relationship details (skip disbursement)
  let settled_at =  neo4j.default.types.LocalDateTime.fromStandardDate(new Date());
  await payout.update({ status: 'settled', settled_at: settled_at, amount: amount, settlement_id: transfer.result.batch_header.payout_batch_id, error: null });
  await payout.relateTo(payout_account, 'to_account');
}

module.exports = {
  disburse: disburse
}
