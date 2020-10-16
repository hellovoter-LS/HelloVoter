
import crypto from 'crypto';
import FormData from 'form-data';
import fetch from 'node-fetch';
import papa from 'papaparse';
import { ov_config } from './ov_config';

export var min_neo4j_version = 3.5;

export function trimFields(obj) {
  let newObj = {};
  let keys = Object.keys(obj);

  for (var x = 0; x < keys.length; x++) {
    let key = keys[x];
    if (obj[key] && typeof obj[key] === 'object') {
      newObj[key] = trimFields(obj[key]);
    } else if (typeof obj[key] === 'string') {
      newObj[key] = obj[key].trim();
    } else {
      newObj[key] = obj[key];
    }
  }
  return newObj;
}

export function serializeName(first_name, last_name) {
  if (!last_name) return first_name;
  return [first_name, last_name].join(" ");
}

export function getClientIP(req) {
  if (ov_config.ip_header) return req.header(ov_config.ip_header);
  else return req.connection.remoteAddress;
}

function sendError(res, code, msg) {
  let obj = { code: code, error: true, msg: msg };
  console.warn('Returning http ' + code + ' error with msg: ' + msg);
  return res.status(code).json(obj);
}

// just do a query and either return OK or ERROR

export async function cqdo(req, res, q, p, a) {
  if (a === true && req.user.admin !== true)
    return _403(res, "Permission denied.");

  let ref;

  // TODO don't go to database to get timestamp
  try {
    ref = + new Date();
  } catch (e) {
    return _500(res, e);
  }

  return res.status(200).json({ msg: "OK", data: [ref] });
}

export async function onMyTurf(req, ida, idb) {
  if (ida === idb) return true;
  if (await sameTeam(req, ida, idb)) return true;
  if (ov_config.disable_spatial !== false) return false;
  try {
    // TODO: extend to also seach for direct turf assignments with leader:true
    let ref = await req.db.query('match (v:Ambassador {id:{idb}}) where exists(v.location) call spatial.intersects("turf", v.location) yield node match (:Ambassador {id:{ida}})-[:MEMBERS {leader:true}]-(:Team)-[:ASSIGNED]-(node) return count(v)', { ida: ida, idb: idb });
    if (ref.data[0] > 0) return true;
  } catch (e) {
    console.warn(e);
  }
  return false;
}

export async function sameTeam(req, ida, idb) {
  try {
    let ref = await req.db.query('match (a:Ambassador {id:{ida}})-[:MEMBERS]-(:Team)-[:MEMBERS]-(b:Ambassador {id:{idb}}) return b', { ida: ida, idb: idb });
    if (ref.data.length > 0) return true;
  } catch (e) {
    console.warn(e);
  }

  return false;
}

export async function volunteerCanSee(req, ida, idb) {
  if (ida === idb) return true;
  if (await sameTeam(req, ida, idb)) return true;
  if (await onMyTurf(req, ida, idb)) return true;
  return false;
}

export async function volunteerAssignments(req, type, vol) {
  let obj = {
    ready: false,
    turfs: [],
    forms: [],
  };
  let members = "MEMBERS";
  let assigned = "ASSIGNED";

  if (vol.admin) obj.admin = vol.admin;
  if (type === 'QRCode') {
    members = "AUTOASSIGN_TO";
    assigned = "AUTOASSIGN_TO";
  }

  try {
    let ref = await req.db.query('match (a:' + type + ' {id:{id}}) optional match (a)-[r:' + members + ']-(b:Team) with a, collect(b{.*,leader:r.leader}) as teams optional match (a)-[:' + assigned + ']-(b:Form) with a, teams, collect(b{.*,direct:true}) as dforms optional match (a)-[:' + members + ']-(:Team)-[:ASSIGNED]-(b:Form) with a, teams, dforms + collect(b{.*}) as forms optional match (a)-[:' + assigned + ']-(b:Turf) with a, teams, forms, collect(b{.id,.name,direct:true}) as dturf optional match (a)-[:' + members + ']-(:Team)-[:ASSIGNED]-(b:Turf) with a, teams, forms, dturf + collect(b{.id,.name}) as turf return forms, turf', vol);

    obj.forms = ref.data[0][0];
    obj.turfs = ref.data[0][1];

  } catch (e) {
    console.warn(e);
  }

  if (obj.turfs.length > 0 && obj.forms.length > 0)
    obj.ready = true;

  return obj;
}

// get the volunteers from the given query, and populate relationships

export async function _volunteersFromCypher(req, query, args) {
  let volunteers = [];

  let ref = await req.db.query(query, args)
  for (let i in ref.data) {
    let c = ref.data[i];
    c.ass = await volunteerAssignments(req, 'Ambassador', c);
    volunteers.push(c);
  }

  return volunteers;
}

export function generateToken({ stringBase = 'base64', byteLength = 48 } = {}) {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(byteLength, (err, buffer) => {
      if (err) {
        reject(err);
      } else {
        resolve(base64edit(buffer.toString(stringBase)));
      }
    });
  });
}

export function base64edit(str) {
  return str
    .replace(/=/g, '_')
    .replace(/\+/g, '.')
    .replace(/\//g, '-');
}

export function _204(res) {
  return res.status(204).send();
}

export function _400(res, msg) {
  return sendError(res, 400, msg);
}

export function _401(res, msg) {
  return sendError(res, 401, msg);
}

export function _403(res, msg) {
  return sendError(res, 403, msg);
}

export function _404(res, msg) {
  return sendError(res, 404, msg);
}

export function _422(res, msg) {
  return sendError(res, 422, msg);
}

export function _500(res, obj) {
  console.warn(obj);
  return sendError(res, 500, "Internal server error.");
}

export function _501(res, msg) {
  return sendError(res, 501, msg);
}

export function _503(res, msg) {
  return sendError(res, 503, msg);
}

export function valid(str) {
  if (!str) return false;
  if (typeof str !== "string") return true;
  if (str.match(/\*/)) return false;
  return true;
}

export async function geoCode(address) {
  let file = "1," + address.address1 + "," +
    address.city + "," + address.state + "," + address.zip;

  let fd = new FormData();
  fd.append('benchmark', 'Public_AR_Current');
  fd.append('returntype', 'locations');
  fd.append('addressFile', file, 'import.csv');

  let res = null;

  try {
    res = await fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'POST', body: fd });
  } catch (err) {
    throw (err);
  }

  // they return a csv file, parse it
  let pp = papa.parse(await res.text());

  // if invalid address, return no match
  if (pp.data[0][2] === "No_Match" || !pp.data[0][5]) {
    return null;
  }

  let coordinates = pp.data[0][5].split(',');
  return {
    longitude: parseFloat(coordinates[0]),
    latitude: parseFloat(coordinates[1])
  };
}

export async function zipToLatLon(zip) {
  let res = null;

  if (!zip || zip.length !== 5) {
    return res;
  }

  try {
    await fetch(`https://public.opendatasoft.com/api/records/1.0/search/?dataset=us-zip-code-latitude-and-longitude&q=${zip}`, { method: 'GET' })
      .then(response => response.json())
      .then(data => {
        res = data["records"];
      }
      );
  } catch (err) {
    throw (err)
  }

  if (res.length === 0 || res[0]["fields"]["zip"] !== zip) {
    return null;
  }

  return {
    longitude: parseFloat(res[0]["fields"]["longitude"]),
    latitude: parseFloat(res[0]["fields"]["latitude"])
  };
}
