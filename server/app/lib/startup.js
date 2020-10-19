
import { asyncForEach, sleep } from './common';

import { ov_config } from './ov_config';
import fifo from './fifo';
import { min_neo4j_version } from './utils';
import queue from './queue';
import cron from './cron';
import ip from './ip';

var _require = require; // so we can lazy load a module later on

var jmx;
var jmxclient = {};
var jvmconfig = {};

export var concurrency = ov_config.job_concurrency;

// tasks to do on startup
export async function doStartupTasks(db, qq, neode) {
  // required to do in sequence
  if (!ov_config.disable_jmx) await doJmxInit(db, qq);
  await ip.init();
  await doDbInit(db);
  await doNeodeInit(neode);
  // can happen in parallel
  postDbInit(qq);
  fifo.init();
  cron.schedule();
}

async function doJmxInit(db, qq) {
  let start = new Date().getTime();
  console.log("doJmxInit() started @ "+start);

  try {
    let data;

    jmx = _require('jmx');

    jmxclient = jmx.createClient({
      host: ov_config.neo4j_host,
      port: ov_config.neo4j_jmx_port,
      username: ov_config.neo4j_jmx_user,
      password: ov_config.neo4j_jmx_pass,
    });
    await new Promise((resolve, reject) => {
      jmxclient.on('connect', resolve);
      jmxclient.on('error', reject);
      jmxclient.connect();
    });

    data = await new Promise((resolve, reject) => {
      jmxclient.getAttribute("java.lang:type=Memory", "HeapMemoryUsage", resolve); //, function(data) {
    });

    let max = data.getSync('max');
    jvmconfig.maxheap = max.longValue;

    data = await new Promise((resolve, reject) => {
      jmxclient.getAttribute("java.lang:type=OperatingSystem", "TotalPhysicalMemorySize", resolve);
    });

    jvmconfig.totalmemory = data.longValue;

    data = await new Promise((resolve, reject) => {
      jmxclient.getAttribute("java.lang:type=OperatingSystem", "AvailableProcessors", resolve);
    });

    jvmconfig.numcpus = data;

    // close the connection
    // TODO: hold it open and actively monitor the system
    jmxclient.disconnect();

  } catch (e) {
    console.warn("Unable to connect to JMX, see error below. As a result, we won't be able to optimize database queries on large sets of data, nor can we honor the JOB_CONCURRENCY configuration.");
    console.warn(e);
  }

  // community edition maxes at 4 cpus
  if (jvmconfig.numcpus && jvmconfig.numcpus > 4) {
    let ref = await db.query('call dbms.components() yield edition');
    if (ref.data[0] !== 'enterprise') {
      console.warn("WARNING: Your neo4j database host has "+jvmconfig.numcpus+" CPUs but you're not running enterprise edition, so only up to 4 are actually utilized by neo4j.");
      jvmconfig.numcpus = 4;
    }
  }

  // don't let job_concurrency go overboard
  if (concurrency > 1) {
    if (!jvmconfig.numcpus) {
      concurrency = 1;
      console.warn("WARNING: Unable to determine number of CPUs available to neo4j. Unable to honor your JOB_CONCURRENCY setting.");
    }
    if (jvmconfig.numcpus <= (concurrency*3)) {
      concurrency = Math.floor(jvmconfig.numcpus/3);
      if (concurrency < 1) concurrency = 1;
      console.warn("WARNING: JOB_CONCURRENCY is set way too high for this database. Lowering it "+concurrency);
    }
  }

  let finish = new Date().getTime();
  console.log("doJmxInit() finished @ "+finish+" after "+(finish-start)+" milliseconds");
}

export async function doNeodeInit(neode) {
  await neode.schema.install();
  console.log('Neode schema installed!');
}

export async function doDbInit(db) {
  let start = new Date().getTime();
  console.log("doDbInit() started @ "+start);

  // make sure we have the plugins we need
  try {
    if (ov_config.disable_spatial === false) await db.query('call spatial.procedures()');
    else console.warn("WARNING: You have disabled the check for the neo4j spatial plugin. Turf features are limited.");
    if (ov_config.disable_apoc === false) await db.query('call apoc.config.map()');
    else console.warn("WARNING: You have disabled the check for the neo4j apoc plugin. Data import features are limited.");
  } catch (e) {
    console.error("The APOC and SPATIAL plugins are required for this application to function.");
    console.error(e);
    process.exit(1);
  }

  let dbv = await db.version();
  if (dbv) {
    let arr = dbv.split('.');
    let ver = Number.parseFloat(arr[0]+'.'+arr[1]);

    if (ver < min_neo4j_version) {
      console.warn("Neo4j version "+min_neo4j_version+" or higher is required.");
      process.exit(1);
    }
  }

  // only call warmup there's enough room to cache the database
  if (!jvmconfig.maxheap || !jvmconfig.totalmemory) {
    console.warn("WARNING: Unable to determine neo4j max heap or total memory. Not initiating database warmup.");
  } else {
    // we're assumiong the host neo4j is running on is dedicated to it; available memory is total system memory minus jvm max heap
    // TODO: check against dbms.memory.pagecache.size configuration as well
    let am = jvmconfig.totalmemory-jvmconfig.maxheap;
    let ds = await db.size();
    if (am < ds) {
      console.warn("WARNING: Database size exceeds available system memory (mem: "+am+" vs. db: "+ds+"). Not initiating database warmup.");
    } else {
      try {
        console.log("Calling apoc.warmup.run(); this may take several minutes.");
        await db.query('call apoc.warmup.run()');
      } catch (e) {
        console.warn("Call to APOC warmup failed.");
        console.warn(e)
      }
    }
  }

  let existingIndexes = await db.query('call db.indexes()');

  let indexes = [
    {label: 'Ambassador', property: 'location', create: 'create index on :Ambassador(location)'},
    {label: 'Tripler', property: 'location', create: 'create index on :Tripler(location)'},
  ];

  // create any indexes we need if they don't exist
  await asyncForEach(indexes, async (index) => {
    let ref = await db.query('call db.indexes() yield tokenNames, properties with * where {label} in tokenNames and {property} in properties return count(*)', index);
    if (ref.data[0] === 0) {
      console.log("Cypher exec: "+index.create);
      await db.query(index.create);
    }
  });

  // delete older name indexes, if they exist
  let full_text_index_needed = true;
  await asyncForEach(existingIndexes.data, async (index) => {
    if (index[0] === 'INDEX ON :Tripler(first_name)') {
      console.log('Deleting older name index')
      await db.query('DROP INDEX ON :Tripler(first_name)')
    }
    if (index[0] === 'INDEX ON :Tripler(last_name)') {
      console.log('Deleting older name index')
      await db.query('DROP INDEX ON :Tripler(last_name)')
    }
    if (index[0] === 'INDEX ON NODE:Tripler(first_name, last_name)') {
      full_text_index_needed = false;
    }
  });

  /*
  let indexes = [
    {label: 'Attribute', property: 'id', create: 'create constraint on (a:Attribute) assert a.id is unique'},
    {label: 'Person', property: 'id', create: 'create constraint on (a:Person) assert a.id is unique'},
    {label: 'Address', property: 'id', create: 'create index on :Address(id)'}, // asserting a.id is unique causes issues so we handle dupes manually
    {label: 'Address', property: 'updated', create: 'create index on :Address(updated)'},
    {label: 'Address', property: 'position', create: 'create index on :Address(position)'},
    {label: 'Address', property: 'bbox', create: 'create index on :Address(bbox)'},
    {label: 'Device', property: 'UniqueID', create: 'create constraint on (a:Device) assert a.UniqueID is unique'},
    {label: 'Ambassador', property: 'id', create: 'create constraint on (a:Ambassador) assert a.id is unique'},
    {label: 'Ambassador', property: 'location', create: 'create index on :Ambassador(location)'},
    {label: 'Team', property: 'id', create: 'create constraint on (a:Team) assert a.id is unique'},
    {label: 'Team', property: 'name', create: 'create constraint on (a:Team) assert a.name is unique'},
    {label: 'Turf', property: 'id', create: 'create constraint on (a:Turf) assert a.id is unique'},
    {label: 'Turf', property: 'name', create: 'create constraint on (a:Turf) assert a.name is unique'},
    {label: 'Form', property: 'id', create: 'create constraint on (a:Form) assert a.id is unique'},
    {label: 'Unit', property: 'id', create: 'create constraint on (a:Unit) assert a.id is unique'},
    {label: 'ImportFile', property: 'id', create: 'create constraint on (a:ImportFile) assert a.id is unique'},
    {label: 'ImportFile', property: 'filename', create: 'create constraint on (a:ImportFile) assert a.filename is unique'},
    {label: 'QueueTask', property: 'id', create: 'create constraint on (a:QueueTask) assert a.id is unique'},
    {label: 'QueueTask', property: 'created', create: 'create index on :QueueTask(created)'},
    {label: 'CallerQueue', property: 'created', create: 'create index on :CallerQueue(created)'},
  ];

  // create any indexes we need if they don't exist
  await asyncForEach(indexes, async (index) => {
    let ref = await db.query('call db.indexes() yield tokenNames, properties with * where {label} in tokenNames and {property} in properties return count(*)', index);
    if (ref.data[0] === 0) {
      console.log("Cypher exec: "+index.create);
      await db.query(index.create);
    }
  });

  let spatialLayers = [
    {name: "turf", create: 'call spatial.addWKTLayer("turf", "wkt")'},
    {name: "address", create: 'call spatial.addLayerWithEncoder("address", "NativePointEncoder", "position")'},
  ];

  if(ov_config.disable_spatial === false) {
    // create any spatial layers we need if they don't exist
    await asyncForEach(spatialLayers, async (layer) => {
      let ref = await db.query('match (a {layer:{layer}})-[:LAYER]-(:ReferenceNode {name:"spatial_root"}) return count(a)', {layer: layer.name});
      if (ref.data[0] === 0) {
        await db.query(layer.create);
        await sleep(1000);
      }
    });
  }

  // TODO: load race/language data from a 3rd party and have the client do "autocomplete" type functionality

  // common attributes that should be interchangeable between systems
  let defaultAttributes = [
    {id: "013a31db-fe24-4fad-ab6a-dd9d831e72f9", name: "Name", order: 0, type: "string", multi: false},
    {id: "a0e622d2-db0a-410e-a315-52c65f678ffa", name: "Gender", order: 1, type: "string", multi: false, values: ["Male","Female","Non-Binary"]},
    {id: "4a320f76-ef7b-4d73-ae2a-8f4ccf5de344", name: "Party Affiliation", order: 2, type: "string", multi: false, values: ["No Party Preference","Democratic","Republican","Green","Libertarian","Other"]},
    {id: "dcfc1fbb-4609-4900-bbb3-1c4afb2a5127", name: "Registered to Vote", order: 3, type: "boolean", multi: false},
    {id: "134095d5-c1c8-46ad-9952-cc66e2934f9e", name: "Receive Notifications", order: 4, type: "string", multi: true, values: ["Phone","Text","Email"]},
    {id: "7d3466e5-2cee-491e-b3f4-bfea3a4b010a", name: "Phone Number", order: 5, type: "string", multi: true},
    {id: "a23d5959-892d-459f-95fc-9e2ddcf1bbc7", name: "Do Not Call", order: 6, type: "boolean", multi: false},
    {id: "b687b86e-8fe3-4235-bb78-1919bcca00db", name: "Email Address", order: 7, type: "string", multi: true},
    {id: "9a903e4f-66ea-4625-bacf-43abb53c6cfc", name: "Date of Birth", order: 8, type: "date", multi: false},
    {id: "f6a41b03-0dc8-4d59-90bf-033db6a96214", name: "US Military Veteran", order: 9, type: "boolean", multi: false},
    {id: "689dc96a-a1db-4b20-9443-e69185675d28", name: "Health Insurance", order: 10, type: "boolean", multi: false},
    {id: "2ad269f5-2712-4a0e-a3d4-be3074a695b6", name: "Race and Ethnicity", order: 11, type: "string", multi: true, values: ["Prefer not to say","African American","Asian","Hispanic","Latino","Native American","Pacific Islander","White"]},
    {id: "59f09d32-b782-4a32-b7f1-4ffe81975167", name: "Spoken Languages", order: 12, type: "string", multi: true, values: ["English","Spanish","Chinese","Arabic","French","German"]},
    {id: "6d895d04-94b8-4df9-af12-7e5b08c624d5", name: "Notes", order: 13, type: "textbox", multi: false},
  ];

  await asyncForEach(defaultAttributes, async (attribute) => {
    let ref = await db.query('match (a:Attribute {id:{id}}) return count(a)', {id: attribute.id});
    if (ref.data[0] === 0) {
      await db.query('create (:Attribute {id:{id},name:{name},order:{order},type:{type},multi:{multi}})', attribute);
      if (attribute.values) await db.query('match (a:Attribute {id:{id}}) set a.values = {values}', attribute);
    }
  });*/

  let finish = new Date().getTime();
  console.log("doDbInit() finished @ "+finish+" after "+(finish-start)+" milliseconds");
}

async function postDbInit(qq) {
  let start = new Date().getTime();
  console.log("postDbInit() started @ "+start);

  // assume any "active" tasks on startup died on whatever shut us down, and mark them as failed
  await qq.clearQueue("Task was active upon server startup and thus marked as failed.");

  let finish = new Date().getTime();
  console.log("postDbInit() finished @ "+finish+" after "+(finish-start)+" milliseconds");
}
