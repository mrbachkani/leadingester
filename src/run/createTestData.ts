import { pool } from "../db/pool.js";

async function main() {
  const batchId = '433b4b2f-3d2b-4232-974c-ede16f13525a';
  
  const companies = [
    {name: 'IRM ENERGY LIMITED', addr: '4th Floor, Block 8, Magnet Corporate Park, Near Sola Bridge, S.G. Highway, Ahmedabad, Gujarat, 380054'},
    {name: 'FINETONE REALTORS PRIVATE LIMITED', addr: 'Welspun City, Post Box No.21, Village Versamedi, Anjar, Kachchh, Gujarat, 370110'},
    {name: 'PALIWAL ENGINEERING PROCESS EQUIPMENT PRIVATE LIMITED', addr: '40,42, PARMESHWAR-2 G.I.D.C. PHASE-1, VATVA, Ahmedabad, Gujarat, 382445'},
    {name: 'CONCORD PRINTING PRIVATE LIMITED', addr: 'PLOT NO 14-15, SHAH INDUSTRIAL PARK-3, Vaghodia, Vadodara, Gujarat, 391510'},
    {name: 'DHARAM CORPORATION PRIVATE LIMITED', addr: 'Shop No. 3, Ground Floor, Ahmedabad, Gujarat, 380015'}
  ];
  
  for (const c of companies) {
    const res = await pool.query(
      'INSERT INTO companies(company_id, legal_name, address_raw) VALUES(gen_random_uuid(), $1, $2) RETURNING company_id',
      [c.name, c.addr]
    );
    const cid = res.rows[0].company_id;
    await pool.query(
      'INSERT INTO company_sources(company_id, batch_id, source_type) VALUES($1, $2, $3)',
      [cid, batchId, 'csv']
    );
    console.log(`Created: ${c.name} (${cid})`);
  }
  
  console.log('Done creating test data');
  process.exit(0);
}

main();
