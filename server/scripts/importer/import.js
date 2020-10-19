#!/usr/bin/env node

import neode from '../../app/lib/neode.js';
import yargs from 'yargs';
import parse from 'csv-parse';
import fs from 'fs';
import cliProgress from 'cli-progress';
import { v4 as uuidv4 } from 'uuid';

import { normalizePhone } from '../../app/lib/normalizers';
import { geoCode } from '../../app/lib/utils';

const argv = yargs
               .scriptName("import.js")
               .usage('$0 <cmd> [options] <filename>')
               .command('import [filename]', 'parse the given csv file.', (yargs) => {
                 yargs.positional('filename', {
                   type: 'string',
                   describe: 'csv file to parse'
                 })
               }, async function (argv) {
                 await parseCsv(argv)
                         .then( ()=> { process.exit(0) } )
                         .catch( (err)=> { console.log(err); process.exit(1); } );
               })
               .option({
                 'edges': {
                   describe: 'parse the csv as edges file',
                   type: 'boolean'
                 }
               })
               .option({
                 'latCol': {
                   describe: 'column of the latitude',
                   type: 'integer'
                 }
               })
               .option({
                 'longCol': {
                   describe: 'column of the longitude',
                   type: 'integer'
                 }
               })
               .option({
                 'from': {
                   describe: 'parse from line N (starts at 1)',
                   type: 'number'
                 }
               })
               .help()
               .argv

function parseAddress(record) {
  let arr = [];
  if (record[7].trim().length > 0) arr.push(record[7].trim());
  if (record[8].trim().length > 0) arr.push(record[8].trim());
  return arr.join(',');
}

function parseZip(record) {
  try {
    return parseInt(record[12]);
  }
  catch(err) {
    return record[12];
  }
}

function parsePhone(record) {
  let phone = record[2].trim().length !== 0 ? record[2].trim() : record[1].trim();
  return phone.length > 0 ? normalizePhone(phone) : null;
}

function parseLocation(record, argv) {
  return {
    latitude: argv.latCol ? parseFloat(record[parseInt(argv.latCol)]) : 0,
    longitude: argv.longCol ? parseFloat(record[parseInt(argv.longCol)]) : 0,
  };
}

async function parseRecord(record, argv) {
  let obj = {
    id: uuidv4(),
    voter_id: record[0],
    first_name: record[3],
    last_name: record[4],
    address: JSON.stringify({
      address1: parseAddress(record),
      city: record[10],
      state: record[11],
      zip: parseZip(record)
    }),
    location: parseLocation(record, argv),
    phone: parsePhone(record),
    status: 'unconfirmed'
  };

  if (obj.location.latitude === 0 || obj.location.longitude === 0) {
    obj.location = await geoCode(JSON.parse(obj.address));
    if (!obj.location) obj.location = { latitude: 0, longitude: 0};
  }

  return obj;
}

function parseEdge(record) {
  return {
    tripler1_voter_id: record[1],
    tripler2_voter_id: record[2],
    distance: record[4]
  }
}

async function parseCsv(argv) {
  const csvFile = fs.readFileSync(argv.filename, 'utf8');

  console.log('file loaded. starting parse.\n');

  let startRow = argv.from ? argv.from : 2; // ignore header by default

  const parsed = parse(csvFile, { from_line: startRow });

  const bar1 = new cliProgress.SingleBar({
    format: 'progress [{bar}] Elapsed: {duration_formatted} | ETA: {eta_formatted} | {percentage}% | {value}/{total}'
  }, cliProgress.Presets.shades_classic);

  bar1.start(csvFile.split('\n').length, startRow);

  for await (const record of parsed) {
    let parsedRecord = '';
    if (argv.edges) {
      parsedRecord = parseEdge(record);
      let tripler1 = null;
      let tripler2 = null;
      try {
        tripler1 = await neode.first('Tripler', 'voter_id', parsedRecord.tripler1_voter_id);
      } catch (err) {
        console.log('error finding tripler for relationship: ', err);
      }
      try {
        tripler2 = await neode.first('Tripler', 'voter_id', parsedRecord.tripler2_voter_id);
      } catch (err) {
        console.log('error finding tripler for relationship: ', err);
      }
      try {
        await tripler1.relateTo(tripler2, 'knows', {distance: parsedRecord.distance});
      } catch (err) {
        console.log('error creating relationship: ', err);
      }
    } else {
      parsedRecord = await parseRecord(record, argv);
      try {
        if (parsedRecord.phone) {
          let existing_record = await neode.first('Tripler', 'phone', parsedRecord.phone);
          if (existing_record) {
            delete parsedRecord.phone;
          }
        }
        await neode.create('Tripler', parsedRecord);
      } catch (err) {
        console.log('error parsing: ', err);
      }
    }

    bar1.increment();
  }

  console.log('\n.... done.\n');
  return true;
}
