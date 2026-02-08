-- Create batch
INSERT INTO import_batches(batch_id, file_name, total_rows) VALUES 
  ('433b4b2f-3d2b-4232-974c-ede16f13525a', 'test_data.csv', 5);

-- Create test companies
INSERT INTO companies(company_id, jurisdiction, registry_id, legal_name, address_raw) VALUES 
  ('0002ded3-9795-43f0-990b-8aef66a2cfb1', 'IN', 'TEST001', 'IRM ENERGY LIMITED', '4th Floor, Block 8, Magnet Corporate Park, Near Sola Bridge, S.G. Highway, Ahmedabad, Gujarat, 380054'),
  ('0003f4cd-8bd5-4a69-a316-9dc66d83132e', 'IN', 'TEST002', 'FINETONE REALTORS PRIVATE LIMITED', 'Welspun City, Post Box No.21, Village Versamedi, Anjar, Kachchh, Gujarat, 370110'),
  ('0008709c-cc7e-45a8-98e7-856235c08061', 'IN', 'TEST003', 'PALIWAL ENGINEERING PROCESS EQUIPMENT PRIVATE LIMITED', '40,42, PARMESHWAR-2 G.I.D.C. PHASE-1, VATVA, Ahmedabad, Gujarat, 382445'),
  ('0011b5c0-349b-4338-bb37-4d9ab25ce84c', 'IN', 'TEST004', 'CONCORD PRINTING PRIVATE LIMITED', 'PLOT NO 14-15, SHAH INDUSTRIAL PARK-3, Vaghodia, Vadodara, Gujarat, 391510'),
  ('002643e9-129a-4dd5-bd48-fdae35df5672', 'IN', 'TEST005', 'DHARAM CORPORATION PRIVATE LIMITED', 'Shop No. 3, Ground Floor, Ahmedabad, Gujarat, 380015');

-- Link to batch
INSERT INTO company_sources(company_id, batch_id) VALUES
  ('0002ded3-9795-43f0-990b-8aef66a2cfb1', '433b4b2f-3d2b-4232-974c-ede16f13525a'),
  ('0003f4cd-8bd5-4a69-a316-9dc66d83132e', '433b4b2f-3d2b-4232-974c-ede16f13525a'),
  ('0008709c-cc7e-45a8-98e7-856235c08061', '433b4b2f-3d2b-4232-974c-ede16f13525a'),
  ('0011b5c0-349b-4338-bb37-4d9ab25ce84c', '433b4b2f-3d2b-4232-974c-ede16f13525a'),
  ('002643e9-129a-4dd5-bd48-fdae35df5672', '433b4b2f-3d2b-4232-974c-ede16f13525a');
