import stringFormat from "string-format";

import logger from "logops";
import neo4j from "neo4j-driver";
import neode from "../lib/neode";
import { serializeName } from "../lib/utils";
import { normalize } from "../lib/phone";
import mail from "../lib/mail";
import { ov_config } from "../lib/ov_config";
import sms from "../lib/sms";
import stripe from "./stripe";
import {
  serializeTripler,
  serializeNeo4JTripler,
  serializeTriplee,
  serializeTripleeForCSV,
} from "../routes/api/v1/va/serializers";

async function findById(triplerId) {
  return await neode.first("Tripler", "id", triplerId);
}

async function findByPhone(phone) {
  return await neode.first("Tripler", "phone", normalize(phone));
}

async function findRecentlyConfirmedTriplers() {
  let confirmed_triplers = await neode
    .model("Tripler")
    .all({ status: "confirmed" });
  let recently_confirmed = [];
  for (var x = 0; x < confirmed_triplers.length; x++) {
    let tripler = confirmed_triplers.get(x);
    if (
      (tripler.get("confirmed_at") && !tripler.get("upgrade_sms_sent")) ||
      tripler.get("upgrade_sms_sent") === false
    ) {
      recently_confirmed.push(tripler);
    }
  }
  return recently_confirmed;
}

async function confirmTripler(triplerId) {
  let tripler = await neode.first("Tripler", "id", triplerId);
  let ambassador = tripler.get("claimed");
  if (tripler && tripler.get("status") === "pending") {
    let confirmed_at = neo4j.default.types.LocalDateTime.fromStandardDate(
      new Date()
    );
    await tripler.update({ status: "confirmed", confirmed_at: confirmed_at });
    let payout = await neode.create("Payout", {
      amount: ov_config.payout_per_tripler,
      status: "pending",
    });
    await ambassador.relateTo(payout, "gets_paid", {
      tripler_id: tripler.get("id"),
    });

    // If this ambassador was once a tripler, then reward the ambassador that
    // initially claimed the then-tripler, only once per upgraded ambassador

    let was_once = ambassador.get("was_once");

    if (was_once && !was_once.get("rewarded_previous_claimer")) {
      let was_tripler = was_once.otherNode();
      if (was_tripler.get("status") === "confirmed") {
        await was_once.update({ rewarded_previous_claimer: true });
        await was_tripler.update({ is_ambassador_and_has_confirmed: true });
        was_tripler = await neode.first("Tripler", "id", was_tripler.get("id"));
        // This must be done because 'eager' only goes so deep
        let claimer = was_tripler.get("claimed");
        let first_reward = await neode.create("Payout", {
          amount: ov_config.first_reward_payout,
          status: "pending",
        });
        await claimer.relateTo(first_reward, "gets_paid", {
          tripler_id: was_tripler.get("id"),
        });
      }
    }
  } else {
    throw "Invalid status, cannot confirm";
  }

  // send ambassador an sms
  let triplees = JSON.parse(tripler.get("triplees"));
  try {
    await sms(
      ambassador.get("phone"),
      stringFormat(ov_config.tripler_confirmed_ambassador_notification, {
        ambassador_first_name: ambassador.get("first_name"),
        ambassador_landing_page: ov_config.ambassador_landing_page,
        payment_amount: "$" + ov_config.payout_per_tripler / 100,
        tripler_first_name: tripler.get("first_name"),
        triplee_1: serializeTriplee(triplees[0]),
        triplee_2: serializeTriplee(triplees[1]),
        triplee_3: serializeTriplee(triplees[2]),
      })
    );
  } catch (err) {
    req.logger.error("Could not send ambassador SMS on tripler confirmation: %s", err);
  }

  // send email in the background
  let tripler_name = serializeName(
    tripler.get("first_name"),
    tripler.get("last_name")
  );
  let tripler_phone = tripler.get("phone");
  let ambassador_name = serializeName(
    ambassador.get("first_name"),
    ambassador.get("last_name")
  );

  setTimeout(async () => {
    let relationships = ambassador.get("claims");
    let date_claimed = null;
    let relationship = null;
    let confirmed_at = neo4j.default.types.LocalDateTime.fromStandardDate(
      new Date()
    );
    for (let x = 0; x < relationships.length; x++) {
      let this_claim = relationships.get(x);
      let claimed_tripler = this_claim.otherNode();
      if (tripler.id === claimed_tripler.id) {
        relationship = relationships.get(x);
        date_claimed = relationship.get("since");
      }
    }
    let verification = JSON.parse(tripler.get("verification"));
    let address = JSON.parse(tripler.get("address"));
    let body = `
    Organization Name:
    <br>
    ${ov_config.organization_name}
    <br>
    <br>
    LALVOTERID:
    <br>
    ${tripler.get("voter_id")}
    <br>
    <br>
    First Name:
    <br>
    ${tripler.get("first_name")}
    <br>
    <br>
    Last Name:
    <br>
    ${tripler.get("last_name")}
    <br>
    <br>
    Street Address:
    <br>
    ${address.address1}
    <br>
    <br>
    Zip:
    <br>
    ${address.zip}
    <br>
    <br>
    Date Claimed:
    <br>
    ${new Date(relationship.get("since"))}
    <br>
    <br>
    Date Confirmed:
    <br>
    ${new Date(confirmed_at)}
    <br>
    <br>
    Ambassador:
    <br>
    ${ambassador_name}
    <br>
    <br>
    Phone Number:
    <br>
    ${tripler.get("phone")}
    <br>
    <br>
    Triplee 1:
    <br>
    ${serializeTripleeForCSV(triplees[0])}
    <br>
    <br>
    Triplee 2:
    <br>
    ${serializeTripleeForCSV(triplees[1])}
    <br>
    <br>
    Triplee 3:
    <br>
    ${serializeTripleeForCSV(triplees[2])}
    <br>
    <br>
    Verification:
    <br>
    ${tripler.get('verification')}
    <br>
    <br>
    Carrier Info:
    <br>
    ${tripler.get('carrier_info')}
    <br>
    <br>
    Blocked Carrier Info:
    <br>
    ${tripler.get('blocked_carrier_info')}
    <br>
    <br>

    `;
    let subject = stringFormat(ov_config.tripler_confirm_admin_email_subject, {
      organization_name: ov_config.organization_name,
    });
    await mail(ov_config.admin_emails, null, null, subject, body);
  }, 100);
}

async function detachTripler(triplerId) {
  let tripler = await neode.first("Tripler", "id", triplerId);
  if (tripler) {
    let ambassador = tripler.get("claimed");
    if (ambassador) {
      await sms(tripler.get("phone"), ov_config.rejection_sms_for_tripler);
      await sms(ambassador.get("phone"), stringFormat(ov_config.rejection_sms_for_ambassador, {
        ambassador_first_name: ambassador.get("first_name"),
        tripler_first_name: tripler.get("first_name"),
        ambassador_landing_page: ov_config.ambassador_landing_page
      }))
      await tripler.delete();
    }
  } else {
    throw "Invalid tripler, cannot detach";
  }
}

async function reconfirmTripler(triplerId) {
  let tripler = await neode.first("Tripler", "id", triplerId);
  if (tripler) {
    if (tripler.get("status") !== "pending") {
      throw "Invalid status, cannot proceed";
    }

    let ambassador = tripler.get("claimed");

    let triplees = JSON.parse(tripler.get("triplees"));
    await sms(
      tripler.get("phone"),
      stringFormat(ov_config.tripler_reconfirmation_message, {
        ambassador_first_name: ambassador.get("first_name"),
        ambassador_last_name: ambassador.get("last_name") || "",
        organization_name: process.env.ORGANIZATION_NAME,
        tripler_first_name: tripler.get("first_name"),
        triplee_1: serializeTriplee(triplees[0]),
        triplee_2: serializeTriplee(triplees[1]),
        triplee_3: serializeTriplee(triplees[2]),
      })
    );
  } else {
    throw "Invalid tripler";
  }
}

async function upgradeNotification(triplerId) {
  let tripler = await neode.first("Tripler", "id", triplerId);
  if (tripler) {
    await sms(
      tripler.get("phone"),
      stringFormat(ov_config.tripler_upgrade_message, {
        ambassador_first_name: ambassador.get("first_name"),
        ambassador_last_name: ambassador.get("last_name") || "",
        organization_name: process.env.ORGANIZATION_NAME,
        tripler_first_name: tripler.get("first_name"),
        triplee_1: serializeTriplee(triplees[0]),
        triplee_2: serializeTriplee(triplees[1]),
        triplee_3: serializeTriplee(triplees[2]),
      })
    );
  } else {
    throw "Invalid tripler";
  }
}

async function adminSearchTriplers(req) {
  let query = {};

  if (req.query.phone) query.phone = normalize(req.query.phone);
  if (req.query.email) query.email = req.query.email;
  if (req.query.firstName) query.first_name = req.query.firstName;
  if (req.query.lastName) query.last_name = req.query.lastName;
  if (req.query.voterId) query.voter_id = req.query.voterId;
  if (req.query.status) query.status = req.query.status;
  if (req.query.isAmbassadorAndHasConfirmed)
    query.is_ambassador_and_has_confirmed =
      req.query.isAmbassadorAndHasConfirmed;

  const collection = await req.neode.model("Tripler").all(query);
  let models = [];
  for (var index = 0; index < collection.length; index++) {
    let entry = collection.get(index);
    models.push(serializeTripler(entry));
  }
  return models;
}

function buildSearchTriplerQuery(query) {
  let neo4jquery = "";
  if (query.firstName || query.lastName) {
    let firstNameQuery = ''
    let lastNameQuery = ''
    if (query.firstName) {
      firstNameQuery = ` first_name:${query.firstName.trim().toLowerCase()}~`;
    }
    if (query.lastName) {
      lastNameQuery = ` last_name:${query.lastName.trim().toLowerCase()}~`;
    }
    neo4jquery += ` CALL db.index.fulltext.queryNodes("TriplerNameIndex", "${firstNameQuery + lastNameQuery}") YIELD node AS t `
  }

  return neo4jquery
}

async function searchTriplersAmbassador(req) {
  let neo4jquery = buildSearchTriplerQuery(req.query);

  /*
  let exclude_except = '';
  if (ov_config.exclude_unreg_except_in) {
    exclude_except += ov_config.exclude_unreg_except_in.split(",").map((state) => {
      return `AND NOT t.address CONTAINS '\"state\": \"${state}\"' `
    }).join(' ')
  }
  */

  let q = await neode
    .query()
    .match("a", "Ambassador")
    .where("a.id", req.user.get("id"))
    .whereRaw("NOT ()-[:CLAIMS]->(t)")
    .whereRaw("NOT ()-[:WAS_ONCE]->(t)")
    // .whereRaw(`NOT t.voter_id CONTAINS "Unreg" ${exclude_except}`)
    .whereRaw(`distance(t.location, a.location) <= ${ov_config.search_tripler_max_distance}`) // distance in meters (see .env)
    .with("a, t, distance(t.location, a.location) AS distance")
    .orderBy("distance")
    .return("t, distance")
    .limit(ov_config.suggest_tripler_limit)
    .build();

  q.query = neo4jquery + q.query
  q.query = q.query.replace('$where_a_id', '"' + req.user.get("id") + '"')

  let collection = await neode.cypher(q.query);

  /*
  let firstNameQuery = req.query.firstName;
  let lastNameQuery = req.query.lastName;

  let q = `CALL db.index.fulltext.queryNodes("triplerFullNameIndex", "${firstNameQuery + ' ' + lastNameQuery}") YIELD node with node limit 500 with node, apoc.text.levenshteinSimilarity(toLower(node.full_name), "${firstNameQuery + ' ' + lastNameQuery}") as score1, apoc.text.jaroWinklerDistance(toLower(node.full_name), "${firstNameQuery + ' ' + lastNameQuery}") as score2, apoc.text.sorensenDiceSimilarity(toLower(node.full_name), "${firstNameQuery + ' ' + lastNameQuery}") as score3 with node, (score1 + score2 + score3) / 3 as avg_score return node order by avg_score desc limit 100`

  let collection = await neode.cypher(q);
  */


  let models = [];
  for (var index = 0; index < collection.records.length; index++) {
    let entry = collection.records[index]._fields[0].properties;
    models.push(serializeNeo4JTripler(entry));
  }

  return models;
}

//
// searchTriplersAdmin
//
// searching as admin removes constraint of requiring no claims relationship
// as well as removing constraint of requiring no upgraded status
//
async function searchTriplersAdmin(req) {
  let neo4jquery = buildSearchTriplerQuery(req.query);
  let q = await neode
    .query()
    .match("t", "Tripler")
    .return("t")
    .limit(ov_config.suggest_tripler_limit)
    .build();

  q.query = neo4jquery + q.query
  q.query = q.query.replace('$where_a_id', '"' + req.user.get("id") + '"')

  let collection = await neode.cypher(q.query);
  let models = [];
  for (var index = 0; index < collection.records.length; index++) {
    let entry = collection.records[index]._fields[0].properties;
    models.push(serializeNeo4JTripler(entry));
  }

  return models;
}

async function updateTriplerBlockedCarrier(tripler, carrier) {
  await tripler.update({
    blocked_carrier_info: tripler.get('blocked_carrier_info') ? tripler.get('blocked_carrier_info') + JSON.stringify(carrier, null, 2) : JSON.stringify(carrier, null, 2)
  });
}

async function updateTriplerCarrier(tripler, carrier) {
  await tripler.update({
    carrier_info: tripler.get('carrier_info') ? tripler.get('carrier_info') + JSON.stringify(carrier, null, 2) : JSON.stringify(carrier, null, 2)
  });
}

async function startTriplerConfirmation(
  ambassador,
  tripler,
  triplerPhone,
  triplees,
  verification,
  tripler_birthdate_mm_yy
  
) {

  try {
    await sms(
      triplerPhone,
      stringFormat(ov_config.tripler_confirmation_message, {
        ambassador_first_name: ambassador.get("first_name"),
        ambassador_last_name: ambassador.get("last_name") || "",
        organization_name: ov_config.organization_name,
        tripler_first_name: tripler.get("first_name"),
        tripler_city: JSON.parse(tripler.get("address")).city,
        triplee_1: serializeTriplee(triplees[0]),
        triplee_2: serializeTriplee(triplees[1]),
        triplee_3: serializeTriplee(triplees[2]),
      })
    );
  } catch (err) {
    throw "Error sending confirmation sms to the tripler";
  }

  await tripler.update({
    triplees: JSON.stringify(triplees, null, 2),
    status: "pending",
    phone: triplerPhone,
    dob_entry: tripler_birthdate_mm_yy,
    verification: tripler.get('verification') ? tripler.get('verification') + JSON.stringify(verification, null, 2) : JSON.stringify(verification, null, 2)
  });
}

module.exports = {
  findById: findById,
  findByPhone: findByPhone,
  confirmTripler: confirmTripler,
  detachTripler: detachTripler,
  reconfirmTripler: reconfirmTripler,
  findRecentlyConfirmedTriplers: findRecentlyConfirmedTriplers,
  searchTriplersAmbassador: searchTriplersAmbassador,
  searchTriplersAdmin: searchTriplersAdmin,
  adminSearchTriplers: adminSearchTriplers,
  startTriplerConfirmation: startTriplerConfirmation,
  updateTriplerCarrier: updateTriplerCarrier,
  updateTriplerBlockedCarrier: updateTriplerBlockedCarrier
};
