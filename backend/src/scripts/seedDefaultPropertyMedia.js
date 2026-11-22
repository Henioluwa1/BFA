/**
 * Seed Default Property Building Media Assets
 * Populates authentic building photos across:
 * - BUILDING (Exterior, Entrance, Reception, Lobby)
 * - GROUNDS (Courtyard, Garden, Pool, Deck)
 * - FACILITIES (Lounge, Kitchen, Spa, Penthouse Amenities)
 */

const pool = require('../db/pool');

async function seedPropertyMedia() {
  try {
    console.log('[SEED] Checking existing property media...');
    const existing = await pool.query("SELECT COUNT(*) as count FROM media_assets WHERE entity_type = 'PROPERTY'");
    const count = parseInt(existing[0]?.count || 0, 10);
    console.log(`[SEED] Found ${count} existing property media assets.`);

    // Delete existing to cleanly re-seed
    await pool.query("DELETE FROM media_assets WHERE entity_type = 'PROPERTY'");

    const defaultAssets = [
      // Property 1: Grand Horizon Tower (GHT)
      { entity_type: 'PROPERTY', entity_id: 1, category: 'BUILDING_EXTERIOR', caption: 'Grand Horizon Tower - Iconic Modern Architecture', file_name: 'ght-exterior.jpg', file_url: '/src/assets/ght-exterior.jpg', file_size_bytes: 986402, mime_type: 'image/jpeg', display_order: 1, is_primary: true, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 1, category: 'BUILDING_ENTRANCE', caption: 'Porte-Cochère & Main Grand Entrance', file_name: 'hero-architecture.jpg', file_url: '/src/assets/hero-architecture.jpg', file_size_bytes: 783664, mime_type: 'image/jpeg', display_order: 2, is_primary: false, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 1, category: 'RECEPTION', caption: 'Executive Front Desk & 24/7 Concierge Reception', file_name: 'apt-interior-warm.jpg', file_url: '/src/assets/apt-interior-warm.jpg', file_size_bytes: 322551, mime_type: 'image/jpeg', display_order: 3, is_primary: false, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 1, category: 'LOBBY', caption: 'Resident VIP Atrium & Executive Business Lounge', file_name: 'apt-living-luxury.jpg', file_url: '/src/assets/apt-living-luxury.jpg', file_size_bytes: 606282, mime_type: 'image/jpeg', display_order: 4, is_primary: false, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 1, category: 'SWIMMING_POOL', caption: 'Private Waterfront Sky Terrace & Infinity Deck', file_name: 'apt-terrace-water.jpg', file_url: '/src/assets/apt-terrace-water.jpg', file_size_bytes: 399555, mime_type: 'image/jpeg', display_order: 5, is_primary: false, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 1, category: 'FACILITIES', caption: 'Penthouse Panorama & Rooftop Observation Deck', file_name: 'apt-penthouse-view.jpg', file_url: '/src/assets/apt-penthouse-view.jpg', file_size_bytes: 432520, mime_type: 'image/jpeg', display_order: 6, is_primary: false, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 1, category: 'AMENITY', caption: 'Private Luxury Marble Hydro-Spa Suite', file_name: 'apt-bathroom-spa.jpg', file_url: '/src/assets/apt-bathroom-spa.jpg', file_size_bytes: 137495, mime_type: 'image/jpeg', display_order: 7, is_primary: false, is_published: true, uploaded_by: 1 },

      // Property 2: Azure Bay Residences (ABR)
      { entity_type: 'PROPERTY', entity_id: 2, category: 'BUILDING_EXTERIOR', caption: 'Azure Bay Residences - Waterfront Contemporary Facade', file_name: 'azure-bay-exterior.jpg', file_url: '/src/assets/azure-bay-exterior.jpg', file_size_bytes: 1021021, mime_type: 'image/jpeg', display_order: 1, is_primary: true, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 2, category: 'SWIMMING_POOL', caption: 'Azure Bay Lagoon Pool, Sun Loungers & Deck', file_name: 'azure-bay-pool.jpg', file_url: '/src/assets/azure-bay-pool.jpg', file_size_bytes: 1151746, mime_type: 'image/jpeg', display_order: 2, is_primary: false, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 2, category: 'LOBBY', caption: 'Azure Bay Waterfront Panoramic Lounge', file_name: 'azure-201-living.jpg', file_url: '/src/assets/azure-201-living.jpg', file_size_bytes: 898933, mime_type: 'image/jpeg', display_order: 3, is_primary: false, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 2, category: 'BUILDING_ENTRANCE', caption: 'Azure Bay Private Foyer & Master Resident Wing', file_name: 'azure-201-master.jpg', file_url: '/src/assets/azure-201-master.jpg', file_size_bytes: 812618, mime_type: 'image/jpeg', display_order: 4, is_primary: false, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 2, category: 'FACILITIES', caption: 'Professional Chef Culinary Studio & Catering Hub', file_name: 'azure-201-kitchen.jpg', file_url: '/src/assets/azure-201-kitchen.jpg', file_size_bytes: 694591, mime_type: 'image/jpeg', display_order: 5, is_primary: false, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 2, category: 'AMENITY', caption: 'Azure Bay Hydro-Therapy Marble Wellness Bath', file_name: 'azure-201-bathroom.jpg', file_url: '/src/assets/azure-201-bathroom.jpg', file_size_bytes: 663995, mime_type: 'image/jpeg', display_order: 6, is_primary: false, is_published: true, uploaded_by: 1 },

      // Property 3: The Royal Palms Suites (RPS)
      { entity_type: 'PROPERTY', entity_id: 3, category: 'BUILDING_EXTERIOR', caption: 'The Royal Palms Suites - Grand Manor Architecture', file_name: 'royal-palms-exterior.jpg', file_url: '/src/assets/royal-palms-exterior.jpg', file_size_bytes: 997006, mime_type: 'image/jpeg', display_order: 1, is_primary: true, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 3, category: 'GARDEN', caption: 'Royal Palms Botanical Garden Courtyard & Promenade', file_name: 'royal-palms-courtyard.jpg', file_url: '/src/assets/royal-palms-courtyard.jpg', file_size_bytes: 1086536, mime_type: 'image/jpeg', display_order: 2, is_primary: false, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 3, category: 'LOBBY', caption: 'Royal Palms Grand Reception Salon & Cigar Parlour', file_name: 'royal-301-living.jpg', file_url: '/src/assets/royal-301-living.jpg', file_size_bytes: 975683, mime_type: 'image/jpeg', display_order: 3, is_primary: false, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 3, category: 'BUILDING_ENTRANCE', caption: 'Royal Palms Presidential Entrance & Master Suite', file_name: 'royal-301-bedroom.jpg', file_url: '/src/assets/royal-301-bedroom.jpg', file_size_bytes: 830474, mime_type: 'image/jpeg', display_order: 4, is_primary: false, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 3, category: 'FACILITIES', caption: 'Gourmet Catering & Dining Facilities Hub', file_name: 'apt-kitchen-chef.jpg', file_url: '/src/assets/apt-kitchen-chef.jpg', file_size_bytes: 240466, mime_type: 'image/jpeg', display_order: 5, is_primary: false, is_published: true, uploaded_by: 1 },
      { entity_type: 'PROPERTY', entity_id: 3, category: 'AMENITY', caption: 'Luxury Marble Wellness Ensuite Bath', file_name: 'apt-bathroom-spa.jpg', file_url: '/src/assets/apt-bathroom-spa.jpg', file_size_bytes: 137495, mime_type: 'image/jpeg', display_order: 6, is_primary: false, is_published: true, uploaded_by: 1 },
    ];

    for (const a of defaultAssets) {
      await pool.query(
        `INSERT INTO media_assets (
           entity_type, entity_id, category, caption, file_name, file_path, file_url, file_size_bytes, mime_type, display_order, is_primary, is_published, uploaded_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          a.entity_type, a.entity_id, a.category, a.caption, a.file_name, a.file_url, a.file_url,
          a.file_size_bytes, a.mime_type, a.display_order, a.is_primary, a.is_published, a.uploaded_by
        ]
      );
    }

    console.log(`[SEED] Successfully inserted ${defaultAssets.length} default building media assets!`);
  } catch (err) {
    console.error('[SEED] Error seeding property media:', err);
  } finally {
    await pool.closePool();
  }
}

if (require.main === module) {
  seedPropertyMedia();
}

module.exports = seedPropertyMedia;
