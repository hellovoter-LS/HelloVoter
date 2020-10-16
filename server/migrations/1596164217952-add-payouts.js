'use strict'

require('dotenv').config();

let adapter = null;
async function db() {
  if (adapter) return adapter;

  adapter = require('neode')
                .fromEnv()
                .withDirectory(__dirname + '/../app/models/va');
  await adapter.schema.install();
  return adapter;
}

module.exports.up = async function (next) {
  let neode = await db();

  let ambassadors = await neode.model('Ambassador').all();
  console.log(`${ambassadors.length}x ambassadors to migrate....`);

  for (const ambassador of ambassadors) {
    let payout_account = ambassador.get('owns_account').first() ? ambassador.get('owns_account').first().otherNode() : null;

    let relationships = ambassador.get('earns_off') || [];
    for (const entry of relationships) {
      let tripler = entry.otherNode();
      let status = entry.get('status');
      let error = status === 'settled' ? null : entry.get('error');

      let payload = {
        amount: entry.get('amount'),
        status: status,
        disbursement_id: entry.get('payout_id'),
        disbursed_at: entry.get('disbursed_at'),
        settlement_id: entry.get('settlement_id'),
        settled_at: entry.get('settled_at'),
        error: error
      };
      let payout = await neode.create('Payout', payload);
      await ambassador.relateTo(payout, 'gets_paid', {since: entry.get('since'), tripler_id: tripler.get('id')});
      await payout.relateTo(payout_account, 'to_account');      
    }  
  }

  let query = `MATCH (:Ambassador)-[r:EARNS_OFF]->(:Tripler) DELETE r`;
  await neode.cypher(query);

  next();
}

module.exports.down = async function (next) {
  throw "Down migration not supported";
}