import { v4 as uuidv4 } from 'uuid';

import {
  _204
} from '../../../../lib/utils';

import stripeSvc from '../../../../services/stripe';
import plaidSvc from '../../../../services/plaid';
import { error } from '../../../../services/errors';

async function createStripeAccount(req, res) {
  if (!req.body.token) return error(400, res, "Invalid value to parameter 'token'.");
  if (!req.body.account_id) return error(400, res, "Invalid value to parameter 'account_id'.");

  try {
    const bankAccountToken = await plaidSvc.createStripeBankToken(req.body.token, req.body.account_id);
    const stripeConnectAccount = await stripeSvc.createConnectAccount(req.user, bankAccountToken, req.publicIP);

    const account = await req.neode.create('Account', {
      id: uuidv4(),
      account_type: 'stripe',
      account_id: stripeConnectAccount.id,
      account_data: JSON.stringify({last4: stripeConnectAccount.external_accounts.data[0].last4}),
      is_primary: true
    });

    req.user.get('owns_account').forEach((entry) => {
      entry.otherNode().update({is_primary: false});
    });

    await req.user.relateTo(account, 'owns_account');
    await req.user.update({payout_provider: 'stripe'});
  } catch (err) {
    return error(400, res, err);
  }
  
  return _204(res);
}

async function createStripeTestAccount(req, res) {
  try {
    const bankAccountToken = await plaidSvc.createStripeTestBankToken();
    const stripeConnectAccount = await stripeSvc.createConnectAccount(req.user, bankAccountToken, req.publicIP);

    const account = await req.neode.create('Account', {
      id: uuidv4(),
      account_type: 'stripe',
      account_id: stripeConnectAccount.id,
      account_data: JSON.stringify({last4: stripeConnectAccount.external_accounts.data[0].last4})
    });
    await req.user.relateTo(account, 'owns_account');
    await req.user.update({payout_provider: 'stripe'});
  } catch (err) {
    return error(400, res, err);
  }
  
  return _204(res);
}

module.exports = {
  createStripeAccount: createStripeAccount,
  createStripeTestAccount: createStripeTestAccount
};
