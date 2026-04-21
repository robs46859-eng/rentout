BEGIN;
INSERT INTO market_snapshots (submarket_id, submarket_label, market_avg_rent, occupancy_avg_pct, market_heat_score, source) VALUES ('ZIP-80202', 'ZIP 80202 - RentCast', 2415, 94.2, 79, 'rentcast');
INSERT INTO demographic_snapshots (radius_miles, average_hhi, vacancy_rate_pct, source) VALUES (3, 98500, 5.8, 'census_acs5');
INSERT INTO seo_channels (channel_name, local_seo_score, distribution_pct, listing_completeness, keyword_clusters) VALUES ('Google Business Profile', 91, 44, 98, '["apartments downtown denver","pet friendly rentals denver","denver leasing office"]');
COMMIT;
