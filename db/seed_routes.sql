-- FlyWise (APIx) — Seed the 14-route basket
-- 12 core routes + 2 seasonal routes
-- Weights are placeholder (equal-weight) — to be finalized with MoSPI passenger-share data.

INSERT INTO routes (route_id, origin_airport, destination_airport, domestic_international, route_weight, currency, is_seasonal, season_window) VALUES
-- Domestic (8 routes, INR)
('DEL-BOM', 'DEL', 'BOM', 'domestic', 1.0, 'INR', FALSE, NULL),
('DEL-BLR', 'DEL', 'BLR', 'domestic', 1.0, 'INR', FALSE, NULL),
('BOM-BLR', 'BOM', 'BLR', 'domestic', 1.0, 'INR', FALSE, NULL),
('DEL-CCU', 'DEL', 'CCU', 'domestic', 1.0, 'INR', FALSE, NULL),
('BLR-HYD', 'BLR', 'HYD', 'domestic', 1.0, 'INR', FALSE, NULL),
('MAA-DEL', 'MAA', 'DEL', 'domestic', 1.0, 'INR', FALSE, NULL),
('BOM-HYD', 'BOM', 'HYD', 'domestic', 1.0, 'INR', FALSE, NULL),
('DEL-AMD', 'DEL', 'AMD', 'domestic', 1.0, 'INR', FALSE, NULL),

-- International (4 routes, AED/SGD)
('DEL-DXB', 'DEL', 'DXB', 'international', 1.0, 'AED', FALSE, NULL),
('BOM-DXB', 'BOM', 'DXB', 'international', 1.0, 'AED', FALSE, NULL),
('DEL-SIN', 'DEL', 'SIN', 'international', 1.0, 'SGD', FALSE, NULL),
('BOM-SIN', 'BOM', 'SIN', 'international', 1.0, 'SGD', FALSE, NULL),

-- Seasonal (2 routes, separate analytics tranche)
('DEL-GOI', 'DEL', 'GOI', 'domestic', 1.0, 'INR', TRUE, 'Oct-Mar'),
('DEL-SXR', 'DEL', 'SXR', 'domestic', 1.0, 'INR', TRUE, 'Apr-Oct');
