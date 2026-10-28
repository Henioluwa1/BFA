import React, { useState, useEffect } from 'react';
import { formatNaira } from '../../utils/currency';
import Icons8Icon from './Icons8Icon';
import './ApartmentDetailModal.css';

// Photography Assets
import heroArchitecture from '../../assets/hero-architecture.jpg';
import aptLivingLuxury from '../../assets/apt-living-luxury.jpg';
import aptPenthouseView from '../../assets/apt-penthouse-view.jpg';
import aptInteriorWarm from '../../assets/apt-interior-warm.jpg';
import aptTerraceWater from '../../assets/apt-terrace-water.jpg';
import aptKitchenChef from '../../assets/apt-kitchen-chef.jpg';
import aptBedroomMaster from '../../assets/apt-bedroom-master.jpg';
import aptBathroomSpa from '../../assets/apt-bathroom-spa.jpg';

export const APARTMENTS_CATALOG = {
  1: {
    id: 1,
    name: 'Grand Horizon Tower',
    tagline: 'Flagship High-Rise Serviced Residences • Alagbaka GRA, Akure',
    location: 'Plot 14, Alagbaka GRA Extension, Akure, Ondo State',
    city: 'Akure',
    state: 'Ondo State',
    startingRate: '160000.00',
    totalUnits: 4,
    description:
      'Engineered for executive corporate travelers, visiting dignitaries, and families seeking luxury in Akure. Grand Horizon Tower features 24/7 dual-grid power backed by a continuous solar-hybrid bank and dual 500kVA silent generators, ultra-low latency Wi-Fi 6 fiber internet, soundproof acoustic double-glazing, and an exclusive subterranean parking facility.',
    gallery: [
      {
        id: 'gh-ext',
        category: 'outdoor',
        badge: '🌿 Outdoor Architecture',
        title: 'Contemporary High-Rise Facade',
        desc: 'Striking modern high-rise architecture along Alagbaka GRA with acoustic soundproof double-glazing and private gated porte-cochère.',
        image: heroArchitecture,
      },
      {
        id: 'gh-pool',
        category: 'outdoor',
        badge: '🌿 Outdoor Grounds',
        title: 'Resident Pool & Sundeck',
        desc: 'Private outdoor infinity pool with landscaped palm gardens, open-air relaxation cabanas, and sunbathing terrace.',
        image: aptTerraceWater,
      },
      {
        id: 'gh-lounge',
        category: 'indoor',
        badge: '🛋️ Indoor Living Lounge',
        title: 'Grand Executive Salon',
        desc: 'Spacious salon finished with Italian marble flooring, 75-inch 4K Smart entertainment system, bespoke seating, and ambient lighting.',
        image: aptLivingLuxury,
      },
      {
        id: 'gh-bed',
        category: 'indoor',
        badge: '🛏️ Indoor Master Suite',
        title: 'Master King Bedroom',
        desc: 'Plush orthopaedic king mattress with 600-thread-count Egyptian cotton linens, automated blackout curtains, and acoustic insulation.',
        image: aptBedroomMaster,
      },
      {
        id: 'gh-penthouse',
        category: 'indoor',
        badge: '🛏️ Penthouse Skyline Suite',
        title: 'Sunlit Premier Penthouse',
        desc: 'Perched on the top floors with panoramic views across the lush hills of Akure, custom dressing room, and private elevator landing.',
        image: aptPenthouseView,
      },
      {
        id: 'gh-kitchen',
        category: 'indoor',
        badge: '🍳 Gourmet Chef Kitchen',
        title: 'Fully Appointed Chef Kitchen',
        desc: 'Granite-topped kitchen island, induction hobs, microwave oven, double-door refrigerator, wine chiller, and cookware.',
        image: aptKitchenChef,
      },
      {
        id: 'gh-bath',
        category: 'indoor',
        badge: '🛁 Spa Ensuite Bathroom',
        title: 'Luxury Marble Ensuite',
        desc: 'Deep soaking bathtub, thermostatic rain shower, backlit vanity mirrors, and imported porcelain tiles.',
        image: aptBathroomSpa,
      },
      {
        id: 'gh-work',
        category: 'indoor',
        badge: '💼 Indoor Work Suite',
        title: 'Executive Workstation Suite',
        desc: 'Quiet minimalist suite equipped with an ergonomic work desk, high-speed fiber Wi-Fi 6, and international socket array.',
        image: aptInteriorWarm,
      },
    ],
    outdoorFeatures: [
      { icon: 'building', title: 'High-Rise Architectural Facade', desc: 'Acoustic soundproof glazing, earthquake-resilient reinforced concrete construction.' },
      { icon: 'palm-tree', title: 'Private Landscaped Grounds', desc: 'Manicured tropical garden walkways, outdoor relaxation cabana, and evening LED path lighting.' },
      { icon: 'swimming-pool', title: 'Resident Infinity Swimming Pool', desc: 'Treated fresh-water pool with private sun deck and outdoor shower pavilion.' },
      { icon: 'lightning', title: '24/7 Dual-Grid & Solar-Hybrid Power', desc: 'Dual 500kVA silent generators paired with an industrial solar-hybrid bank guarantee 0% blackouts.' },
      { icon: 'shield-check', title: 'Military-Grade Perimeter Security', desc: '24/7 uniformed guards, automated biometric gate access, and 360° AI-monitored CCTV.' },
      { icon: 'parking', title: 'Subterranean Guarded Parking', desc: 'Direct-elevator access basement parking bays with dedicated allocated slots for each unit.' },
    ],
    indoorFeatures: [
      { icon: 'sofa', title: 'Grand Executive Salon', desc: 'Italian marble floor with custom designer sofas, 75" 4K Smart TV, and Bang & Olufsen audio.' },
      { icon: 'kitchen', title: 'Full Gourmet Chef Kitchen', desc: 'Granite island, induction hobs, oven, microwave, espresso bar, and double-door refrigerator.' },
      { icon: 'bed', title: 'Master King Suites', desc: 'Deep-plush orthopaedic king mattress with 600-thread-count Egyptian cotton and walk-in dressing wardrobe.' },
      { icon: 'bath', title: 'Spa-Grade Ensuite Bathrooms', desc: 'Deep soaking bathtub, thermostatic rain shower, designer toiletries, and instant pressurized hot water.' },
      { icon: 'wifi', title: 'Dedicated Fiber Internet (Wi-Fi 6)', desc: 'Dedicated 500 Mbps symmetrical fiber connectivity with whole-unit mesh coverage.' },
      { icon: 'lightning', title: 'Whisper-Quiet Multi-Zone Inverter AC', desc: 'Independent smart climate control in every room with ultra-low acoustic footprint.' },
    ],
    units: [
      {
        id: 3,
        unitNumber: '103',
        unitName: 'Studio Prime 103',
        unitType: 'Studio Premier',
        rate: '160000.00',
        specs: '1 King Bed • 1 Spa Bath • 45m²',
        image: aptInteriorWarm,
        status: 'AVAILABLE',
      },
      {
        id: 1,
        unitNumber: '102',
        unitName: 'Horizon Deluxe Suite 102',
        unitType: 'Modern Minimalist Suite',
        rate: '220000.00',
        specs: '1 King Bed • 1.5 Baths • 65m²',
        image: aptLivingLuxury,
        status: 'AVAILABLE',
      },
      {
        id: 2,
        unitNumber: '201',
        unitName: 'Azure Waterfront Suite 201',
        unitType: '2-Bedroom Luxury Suite',
        rate: '280000.00',
        specs: '2 King Beds • 2 Spa Baths • 115m²',
        image: aptBedroomMaster,
        status: 'AVAILABLE',
      },
      {
        id: 4,
        unitNumber: '301',
        unitName: 'Skyline Penthouse 301',
        unitType: 'Presidential Penthouse',
        rate: '350000.00',
        specs: '3 King Beds • 3.5 Spa Baths • 180m²',
        image: aptPenthouseView,
        status: 'AVAILABLE',
      },
    ],
  },

  2: {
    id: 2,
    name: 'Azure Bay Residences',
    tagline: 'Serene Garden & Waterfront Luxury Living • Ijapo Estate, Akure',
    location: 'Block 7, Ijapo Central Estate, Akure, Ondo State',
    city: 'Akure',
    state: 'Ondo State',
    startingRate: '140000.00',
    totalUnits: 3,
    description:
      'Nestled inside the tranquil, leafy avenues of historic Ijapo Estate, Akure. Azure Bay Residences offer peaceful luxury with manicured garden courtyards, an exclusive resident swimming pool, private terrace lounges, and high-spec interiors designed for long or short executive stays.',
    gallery: [
      {
        id: 'ab-pool',
        category: 'outdoor',
        badge: '🌿 Outdoor Pool & Terrace',
        title: 'Resident Pool & Garden Pavilion',
        desc: 'Sparkling freshwater pool flanked by tropical palms, lounge chaises, and a sheltered barbecue terrace.',
        image: aptTerraceWater,
      },
      {
        id: 'ab-ext',
        category: 'outdoor',
        badge: '🌿 Gated Estate Facade',
        title: 'Private Gated Entrance',
        desc: 'Quiet residential estate entrance with paved perimeter driveway, guarded security checkpoint, and floral borders.',
        image: heroArchitecture,
      },
      {
        id: 'ab-living',
        category: 'indoor',
        badge: '🛋️ Indoor Living Lounge',
        title: 'Garden View Living Lounge',
        desc: 'Airy living space with floor-to-ceiling glass doors opening onto the garden, 65-inch Smart TV, and plush sectional seating.',
        image: aptLivingLuxury,
      },
      {
        id: 'ab-bed',
        category: 'indoor',
        badge: '🛏️ Indoor Master Bedroom',
        title: 'Serene Master Bedroom',
        desc: 'Warm wooden accents, custom king bed, premium memory foam mattress, and reading spotlights.',
        image: aptBedroomMaster,
      },
      {
        id: 'ab-kitchen',
        category: 'indoor',
        badge: '🍳 Indoor Kitchen',
        title: 'Modern Equipped Kitchen',
        desc: 'Integrated gas and induction cooktops, microwave, double-door fridge, breakfast bar, and stainless steel cookware.',
        image: aptKitchenChef,
      },
      {
        id: 'ab-bath',
        category: 'indoor',
        badge: '🛁 Luxury Spa Bathroom',
        title: 'Polished Ensuite Bath',
        desc: 'Frameless glass walk-in rain shower, floating vanity, and high-pressure hot water systems.',
        image: aptBathroomSpa,
      },
      {
        id: 'ab-terrace-view',
        category: 'outdoor',
        badge: '🌿 Private Verandah',
        title: 'Sunset Verandah',
        desc: 'Spacious outdoor balcony for morning coffee or sunset drinks overlooking Ijapo estate canopy.',
        image: aptPenthouseView,
      },
      {
        id: 'ab-desk',
        category: 'indoor',
        badge: '💼 Indoor Work Suite',
        title: 'Private Study Nook',
        desc: 'Dedicated ergonomic work area with fiber broadband connection.',
        image: aptInteriorWarm,
      },
    ],
    outdoorFeatures: [
      { icon: 'swimming-pool', title: 'Private Swimming Pool & Sun Deck', desc: 'Chlorinated, crystal-clear resident pool with teak deck loungers and pool towels.' },
      { icon: 'palm-tree', title: 'Landscaped Garden Courtyard', desc: 'Lush green lawn with royal palm trees and evening decorative illumination.' },
      { icon: 'lightning', title: 'Uninterrupted 24/7 Power', desc: 'Heavy-duty soundproof industrial generator backed by high-capacity inverter system.' },
      { icon: 'shield-check', title: 'Secure Gated Estate Security', desc: 'Round-the-clock gated security, rapid-response patrol, and visitor screening.' },
      { icon: 'parking', title: 'Secure On-Site Parking', desc: 'Ample marked parking bays with full perimeter security camera coverage.' },
    ],
    indoorFeatures: [
      { icon: 'sofa', title: 'Spacious Garden Lounge', desc: 'Open-concept living room with 65" 4K Smart TV, premium soundbar, and Netflix.' },
      { icon: 'kitchen', title: 'Fully Fitted Kitchen', desc: 'Gas hobs, microwave, electric kettle, refrigerator, and complete dining dinnerware.' },
      { icon: 'bed', title: 'Serene King Suites', desc: 'Plush beds with hypoallergenic duvets, bedside USB charging, and ample wardrobe storage.' },
      { icon: 'bath', title: 'Spa Rain Showers', desc: 'Walk-in rainfall shower enclosures with pressurized instant hot water.' },
      { icon: 'wifi', title: 'High-Speed Wi-Fi', desc: 'Fast, unlimited fiber broadband coverage across the suite.' },
      { icon: 'lightning', title: 'Split-Unit Inverter Air Conditioning', desc: 'Individual room temperature control for optimal comfort.' },
    ],
    units: [
      {
        id: 2,
        unitNumber: '201',
        unitName: 'Azure Waterfront Suite 201',
        unitType: '2-Bedroom Luxury Suite',
        rate: '280000.00',
        specs: '2 King Beds • 2 Baths • 105m²',
        image: aptLivingLuxury,
        status: 'AVAILABLE',
      },
      {
        id: 5,
        unitNumber: '101',
        unitName: 'Garden View Suite 101',
        unitType: '1-Bedroom Premier',
        rate: '140000.00',
        specs: '1 King Bed • 1 Bath • 52m²',
        image: aptInteriorWarm,
        status: 'AVAILABLE',
      },
      {
        id: 6,
        unitNumber: '102',
        unitName: 'Azure Executive Bay 102',
        unitType: '1-Bedroom Luxury',
        rate: '180000.00',
        specs: '1 King Bed • 1.5 Baths • 68m²',
        image: aptTerraceWater,
        status: 'AVAILABLE',
      },
    ],
  },

  3: {
    id: 3,
    name: 'The Royal Palms Suites',
    tagline: 'Presidential Penthouse & Hillside Suites • Oba-Ile, Akure',
    location: 'Suite 24, Presidential Boulevard, Oba-Ile, Akure, Ondo State',
    city: 'Akure',
    state: 'Ondo State',
    startingRate: '200000.00',
    totalUnits: 2,
    description:
      'Perched along the scenic Airport Road corridor in prestigious Oba-Ile, Akure. The Royal Palms Suites offer presidential-grade privacy with sweeping hillside vistas, an expansive open-air sky terrace, private butler services, and palatial multi-room layouts for distinguished guests.',
    gallery: [
      {
        id: 'rp-terrace',
        category: 'outdoor',
        badge: '🌿 Outdoor Sky Terrace',
        title: 'Panoramic Penthouse Sky Terrace',
        desc: 'Expansive private terrace looking out across the picturesque Akure hills, sunset lounge seating, and outdoor dining bar.',
        image: aptPenthouseView,
      },
      {
        id: 'rp-ext',
        category: 'outdoor',
        badge: '🌿 Gated Estate Grounds',
        title: 'Presidential Boulevard Facade',
        desc: 'Gated estate with security gatehouse, manicured royal palm trees, and wide access boulevard.',
        image: heroArchitecture,
      },
      {
        id: 'rp-living',
        category: 'indoor',
        badge: '🛋️ Indoor Grand Salon',
        title: 'Double-Height Grand Salon',
        desc: 'Palatial living room with chandelier lighting, imported leather salon suite, and 85-inch 4K OLED home theater.',
        image: aptLivingLuxury,
      },
      {
        id: 'rp-bed',
        category: 'indoor',
        badge: '🛏️ Indoor Presidential Bedroom',
        title: 'Presidential Master Suite',
        desc: 'Custom-crafted emperor king bed, walk-in dressing lounge, integrated mood lighting, and private study.',
        image: aptBedroomMaster,
      },
      {
        id: 'rp-kitchen',
        category: 'indoor',
        badge: '🍳 Gourmet Chef Kitchen',
        title: 'Chef Kitchen & Wine Bar',
        desc: 'Commercial-grade stainless steel kitchen with granite dining bar, dishwasher, induction range, and espresso bar.',
        image: aptKitchenChef,
      },
      {
        id: 'rp-bath',
        category: 'indoor',
        badge: '🛁 Spa Ensuite Bathroom',
        title: 'Freestanding Tub Spa Bath',
        desc: 'Freestanding deep soaking bathtub, dual rainfall showers, imported Italian travertine, and heated towel racks.',
        image: aptBathroomSpa,
      },
      {
        id: 'rp-suite',
        category: 'indoor',
        badge: '🛏️ Secondary Guest Suite',
        title: 'Deluxe Guest Bedroom',
        desc: 'Sound-insulated secondary suite with plush queen bedding and private ensuite.',
        image: aptInteriorWarm,
      },
      {
        id: 'rp-pool',
        category: 'outdoor',
        badge: '🌿 Terrace Plunge Pool',
        title: 'Terrace Plunge Pool',
        desc: 'Private outdoor terrace plunge pool with infinity edge overlooking the hills.',
        image: aptTerraceWater,
      },
    ],
    outdoorFeatures: [
      { icon: 'building', title: 'Private Penthouse Sky Terrace', desc: 'Vast outdoor terrace with panoramic hillside and sunset views across Ondo State.' },
      { icon: 'palm-tree', title: 'Royal Palms Courtyard', desc: 'Landscaped private courtyard with mature palms, ambient evening lighting, and water fountain.' },
      { icon: 'location', title: 'Fast Airport Road Corridor', desc: 'Just 8 minutes from Akure Domestic Airport with dedicated chauffeur transfers available.' },
      { icon: 'lightning', title: '24/7 Redundant Power Infrastructure', desc: 'Automatic generator changeover and large-capacity solar battery bank.' },
      { icon: 'shield-check', title: 'High-Profile Security Protocol', desc: 'Trained executive protection personnel, gated perimeter, and biometric security.' },
    ],
    indoorFeatures: [
      { icon: 'sofa', title: 'Palatial Grand Salon', desc: 'Chandelier lighting, 85" 4K OLED theater with Dolby Atmos, and bespoke leather seating.' },
      { icon: 'kitchen', title: 'Executive Chef Kitchen', desc: 'State-of-the-art kitchen with induction cooktop, wine fridge, dishwasher, and dining table.' },
      { icon: 'bed', title: 'Presidential Emperor Bed', desc: 'Handcrafted emperor mattress with luxury goose-down pillows and silk-cotton linens.' },
      { icon: 'bath', title: 'Freestanding Soaking Tub', desc: 'Opulent bathroom with freestanding bath, twin vanities, and rain shower.' },
      { icon: 'wifi', title: 'Dedicated Gigabit Fiber Connection', desc: 'Ultra-low latency connection suitable for video conferences and high-bandwidth tasks.' },
      { icon: 'phone', title: 'Concierge & Butler Service', desc: 'On-demand private chef, butler, and daily turndown housekeeping.' },
    ],
    units: [
      {
        id: 7,
        unitNumber: '301',
        unitName: 'Royal Palm Premier 301',
        unitType: 'Presidential Penthouse',
        rate: '200000.00',
        specs: '2 King Beds • 2.5 Baths • 140m²',
        image: aptPenthouseView,
        status: 'AVAILABLE',
      },
      {
        id: 8,
        unitNumber: '302',
        unitName: 'Skyline Hillside Suite 302',
        unitType: '2-Bedroom Luxury Suite',
        rate: '240000.00',
        specs: '2 King Beds • 2 Baths • 110m²',
        image: aptBedroomMaster,
        status: 'AVAILABLE',
      },
    ],
  },
};


export function getRoomTypePhoto(unitType = '', propertyId = 1) {
  const t = (unitType || '').toLowerCase();
  if (t.includes('penthouse') || t.includes('presidential') || t.includes('skyline')) {
    return aptPenthouseView;
  }
  if (t.includes('waterfront') || t.includes('villa') || t.includes('royal') || t.includes('pool')) {
    return aptTerraceWater;
  }
  if (t.includes('2-bedroom') || t.includes('bedroom') || t.includes('master')) {
    return aptBedroomMaster;
  }
  if (t.includes('studio') || t.includes('standard') || t.includes('prime') || t.includes('minimalist')) {
    return aptInteriorWarm;
  }
  if (t.includes('deluxe') || t.includes('lounge') || t.includes('executive')) {
    return aptLivingLuxury;
  }
  if (propertyId === 1) return heroArchitecture;
  if (propertyId === 2) return aptTerraceWater;
  if (propertyId === 3) return aptPenthouseView;
  return aptInteriorWarm;
}

export function getPropertyPhoto(propertyId, code = '') {
  if (propertyId === 1 || code === 'GHT') return heroArchitecture;
  if (propertyId === 2 || code === 'ABR') return aptLivingLuxury;
  if (propertyId === 3 || code === 'RPS') return aptPenthouseView;
  const fallbackImages = [heroArchitecture, aptLivingLuxury, aptPenthouseView, aptTerraceWater, aptInteriorWarm];
  return fallbackImages[((propertyId || 0) % fallbackImages.length)] || heroArchitecture;
}

export function getRoomTypeGallery(unitType = '', property = {}) {
  const t = (unitType || '').toLowerCase();
  if (t.includes('penthouse') || t.includes('presidential')) {
    return [
      { id: 'ph-sky', category: 'outdoor', badge: '🌿 Sky Terrace View', title: 'Private Penthouse Sky Terrace', desc: 'Sweeping panoramic views across Akure with open-air terrace seating.', image: aptPenthouseView },
      { id: 'ph-salon', category: 'indoor', badge: '🛋️ Palatial Grand Salon', title: 'Penthouse Reception Salon', desc: 'Double-height ceilings, designer furnishings, and bespoke ambient lighting.', image: aptLivingLuxury },
      { id: 'ph-bed', category: 'indoor', badge: '🛏️ Emperor Master Bedroom', title: 'Presidential Master Suite', desc: 'Handcrafted emperor mattress with luxury Egyptian linens and walk-in dressing lounge.', image: aptBedroomMaster },
      { id: 'ph-bath', category: 'indoor', badge: '🛁 Spa Ensuite Bathroom', title: 'Freestanding Soaking Tub Spa', desc: 'Deep soaking tub, twin vanities, and rain shower with imported Italian travertine.', image: aptBathroomSpa },
      { id: 'ph-kitchen', category: 'indoor', badge: '🍳 Gourmet Chef Kitchen', title: 'Appointed Chef Kitchen', desc: 'Granite-topped kitchen island, induction hobs, wine chiller, and microwave.', image: aptKitchenChef },
      { id: 'ph-pool', category: 'outdoor', badge: '🌿 Terrace Plunge Pool', title: 'Terrace Plunge Pool', desc: 'Private outdoor plunge pool overlooking the lush hills.', image: aptTerraceWater },
    ];
  }
  if (t.includes('waterfront') || t.includes('villa') || t.includes('3-bedroom') || t.includes('royal')) {
    return [
      { id: 'wf-pool', category: 'outdoor', badge: '🌿 Resident Pool & Cabana', title: 'Waterfront Infinity Pool & Sundeck', desc: 'Crystal-clear freshwater pool with teakwood loungers and garden cabanas.', image: aptTerraceWater },
      { id: 'wf-living', category: 'indoor', badge: '🛋️ Waterfront Lounge', title: 'Garden View Living Lounge', desc: 'Airy open-concept living space with 65-inch Smart TV and Italian marble.', image: aptLivingLuxury },
      { id: 'wf-bed', category: 'indoor', badge: '🛏️ Master King Suite', title: 'Executive Master Bedroom', desc: 'Plush orthopaedic king bed with reading spotlights and private balcony.', image: aptBedroomMaster },
      { id: 'wf-bath', category: 'indoor', badge: '🛁 Luxury Spa Bath', title: 'Polished Ensuite Rain Shower', desc: 'Walk-in rainfall shower enclosure with pressurized instant hot water.', image: aptBathroomSpa },
      { id: 'wf-kitchen', category: 'indoor', badge: '🍳 Fitted Kitchen', title: 'Modern Fitted Kitchen', desc: 'Complete dining dinnerware, microwave, refrigerator, and espresso bar.', image: aptKitchenChef },
    ];
  }
  if (t.includes('2-bedroom') || t.includes('executive')) {
    return [
      { id: 'ex-bed', category: 'indoor', badge: '🛏️ Master King Suite', title: 'Executive Master Bedroom', desc: 'Deep-plush king mattress with acoustic sound insulation and dressing wardrobe.', image: aptBedroomMaster },
      { id: 'ex-salon', category: 'indoor', badge: '🛋️ Executive Living Salon', title: 'Spacious Salon Lounge', desc: 'Custom Italian furnishings with 4K Smart entertainment system.', image: aptLivingLuxury },
      { id: 'ex-kitchen', category: 'indoor', badge: '🍳 Chef Kitchen', title: 'Granite Countertop Kitchen', desc: 'Equipped with induction hobs, oven, and double-door refrigerator.', image: aptKitchenChef },
      { id: 'ex-bath', category: 'indoor', badge: '🛁 Ensuite Bathroom', title: 'Luxury Marble Ensuite', desc: 'Thermostatic rain shower and illuminated vanity mirrors.', image: aptBathroomSpa },
      { id: 'ex-terrace', category: 'outdoor', badge: '🌿 Private Balcony', title: 'Scenic Balcony', desc: 'Outdoor balcony with panoramic estate views.', image: aptTerraceWater },
    ];
  }
  if (t.includes('studio') || t.includes('standard') || t.includes('prime')) {
    return [
      { id: 'st-work', category: 'indoor', badge: '💼 Modern Minimalist Suite', title: 'Studio Premier Suite & Workspace', desc: 'Quiet minimalist suite equipped with ergonomic workstation and fiber Wi-Fi 6.', image: aptInteriorWarm },
      { id: 'st-lounge', category: 'indoor', badge: '🛋️ Living Nook', title: 'Studio Living Area', desc: 'Compact luxury living area with Smart TV and designer seating.', image: aptLivingLuxury },
      { id: 'st-bed', category: 'indoor', badge: '🛏️ Queen/King Bed', title: 'Plush Suite Bedding', desc: 'Orthopaedic mattress with hypoallergenic duvets and mood lighting.', image: aptBedroomMaster },
      { id: 'st-bath', category: 'indoor', badge: '🛁 Ensuite Shower', title: 'Modern Rain Shower', desc: 'Walk-in shower enclosure with instant pressurized hot water.', image: aptBathroomSpa },
      { id: 'st-kitchen', category: 'indoor', badge: '🍳 Kitchenette', title: 'Equipped Kitchenette', desc: 'Microwave, kettle, mini-fridge, and dinnerware.', image: aptKitchenChef },
    ];
  }
  return [
    { id: 'dx-lounge', category: 'indoor', badge: '🛋️ Executive Salon', title: 'Grand Executive Salon', desc: 'Italian marble flooring with custom sofas and 75-inch 4K Smart TV.', image: aptLivingLuxury },
    { id: 'dx-bed', category: 'indoor', badge: '🛏️ Master Suite', title: 'Master King Bedroom', desc: 'Plush orthopaedic king mattress with 600-thread-count Egyptian cotton.', image: aptBedroomMaster },
    { id: 'dx-bath', category: 'indoor', badge: '🛁 Spa Ensuite', title: 'Marble Ensuite Bathroom', desc: 'Deep soaking bathtub and thermostatic rain shower.', image: aptBathroomSpa },
    { id: 'dx-kitchen', category: 'indoor', badge: '🍳 Chef Kitchen', title: 'Gourmet Kitchen', desc: 'Granite island, induction hobs, and espresso bar.', image: aptKitchenChef },
    { id: 'dx-terrace', category: 'outdoor', badge: '🌿 Resident Grounds', title: 'Landscaped Grounds & Terrace', desc: 'Lush tropical grounds with evening illumination.', image: aptTerraceWater },
  ];
}

export default function ApartmentDetailModal({
  isOpen,
  onClose,
  apartmentId = 1,
  propertyData = null,
  roomTypeData = null,
  initialTab = 'gallery',
  onSelectUnitAndBook,
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'gallery'); // 'gallery' | 'outdoor' | 'indoor' | 'units'
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [galleryFilter, setGalleryFilter] = useState('all'); // 'all' | 'outdoor' | 'indoor'

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  // Look up base catalog or fallback to #1
  const baseProperty = APARTMENTS_CATALOG[apartmentId] || APARTMENTS_CATALOG[1];

  // Merge database property data if available
  const property = {
    ...baseProperty,
    ...(propertyData ? {
      name: propertyData.name || baseProperty.name,
      location: propertyData.address ? `${propertyData.address}, ${propertyData.city || 'Akure'}` : baseProperty.location,
      description: propertyData.description || baseProperty.description,
      startingRate: propertyData.starting_rate || baseProperty.startingRate,
      totalUnits: propertyData.total_units || baseProperty.totalUnits,
    } : {}),
  };

  // Determine active gallery items based on roomTypeData or property catalog
  const rawGallery = roomTypeData
    ? getRoomTypeGallery(roomTypeData.unitType, property)
    : (property.gallery || baseProperty.gallery);

  // Determine active units
  const activeUnits = (roomTypeData && roomTypeData.units && roomTypeData.units.length > 0)
    ? roomTypeData.units.map((u) => ({
        id: u.id,
        unitNumber: u.unit_number,
        unitName: u.unit_name,
        unitType: u.unit_type,
        rate: u.rate_per_night,
        specs: `${roomTypeData.capacity || 2} Guests • ${roomTypeData.bedroomCount || 1} Bed`,
        image: getRoomTypePhoto(u.unit_type, property.id),
        status: u.status,
      }))
    : (property.units || baseProperty.units);

  const displayTitle = roomTypeData
    ? `${property.name} — ${roomTypeData.unitType}`
    : property.name;

  const displayRate = roomTypeData
    ? roomTypeData.startingRate
    : property.startingRate;

  // Filter gallery items
  const filteredGallery = (rawGallery || []).filter((item) => {
    if (galleryFilter === 'all') return true;
    return item.category === galleryFilter;
  });

  const activePhoto = filteredGallery[activeGalleryIndex] || filteredGallery[0] || (rawGallery && rawGallery[0]) || { image: heroArchitecture, badge: "✦ Luxury Residence", title: property.name, desc: property.description };

  // Reset active photo index when filter changes
  useEffect(() => {
    setActiveGalleryIndex(0);
  }, [galleryFilter, apartmentId]);

  // Keyboard navigation for gallery & Escape to close
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        setActiveGalleryIndex((prev) => (prev + 1) % filteredGallery.length);
      } else if (e.key === 'ArrowLeft') {
        setActiveGalleryIndex((prev) => (prev - 1 + filteredGallery.length) % filteredGallery.length);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredGallery.length, onClose]);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNextPhoto = () => {
    setActiveGalleryIndex((prev) => (prev + 1) % filteredGallery.length);
  };

  const handlePrevPhoto = () => {
    setActiveGalleryIndex((prev) => (prev - 1 + filteredGallery.length) % filteredGallery.length);
  };

  return (
    <div
      className="bfa-apt-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bfa-apt-modal-title"
    >
      <div
        className="bfa-apt-modal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="bfa-apt-modal-header">
          <div className="bfa-apt-header-left">
            <div className="bfa-apt-header-badge">
              <span className="bfa-apt-badge-icon">⠿</span>
              <span className="bfa-apt-badge-location">Akure, Ondo State</span>
            </div>
            <h2 id="bfa-apt-modal-title" className="bfa-apt-modal-title">
              {property.name}
            </h2>
            <p className="bfa-apt-modal-address" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <Icons8Icon name="location" variant="white" size={14} /> {property.location}
            </p>
          </div>

          <div className="bfa-apt-header-right">
            <div className="bfa-apt-rate-pill">
              <span className="rate-sub">Starting Rate</span>
              <span className="rate-val">{formatNaira(displayRate)}<span className="rate-unit">/nt</span></span>
            </div>
            <button
              type="button"
              className="bfa-apt-modal-close-btn"
              onClick={onClose}
              aria-label="Close modal"
              title="Close (Esc)"
            >
              <Icons8Icon name="close" variant="white" size={14} />
            </button>
          </div>
        </div>

        {/* Navigation Category Tabs */}
        <div className="bfa-apt-modal-tabs">
          <button
            type="button"
            className={`bfa-apt-tab-btn ${activeTab === 'gallery' ? 'active' : ''}`}
            onClick={() => setActiveTab('gallery')}
          >
            <Icons8Icon name="gallery" variant={activeTab === 'gallery' ? 'blue' : 'white'} size={18} />
            <span>Apartment Photo Gallery</span>
          </button>
          <button
            type="button"
            className={`bfa-apt-tab-btn ${activeTab === 'outdoor' ? 'active' : ''}`}
            onClick={() => setActiveTab('outdoor')}
          >
            <Icons8Icon name="building" variant={activeTab === 'outdoor' ? 'blue' : 'white'} size={18} />
            <span>Outdoor & Architecture</span>
          </button>
          <button
            type="button"
            className={`bfa-apt-tab-btn ${activeTab === 'indoor' ? 'active' : ''}`}
            onClick={() => setActiveTab('indoor')}
          >
            <Icons8Icon name="sofa" variant={activeTab === 'indoor' ? 'blue' : 'white'} size={18} />
            <span>Indoor Living & Luxuries</span>
          </button>
          <button
            type="button"
            className={`bfa-apt-tab-btn ${activeTab === 'units' ? 'active' : ''}`}
            onClick={() => setActiveTab('units')}
          >
            <Icons8Icon name="door" variant={activeTab === 'units' ? 'blue' : 'white'} size={18} />
            <span>Available Rentable Units ({activeUnits.length})</span>
          </button>
        </div>

        {/* Modal Body Scroll Container */}
        <div className="bfa-apt-modal-body">
          {/* TAB 1: INTERACTIVE PHOTO GALLERY */}
          {activeTab === 'gallery' && (
            <div className="bfa-apt-tab-pane gallery-pane">
              {/* Gallery Filter Pills */}
              <div className="bfa-apt-gallery-filters">
                <span className="bfa-filters-label">Filter Views:</span>
                <button
                  type="button"
                  className={`bfa-gallery-filter-pill ${galleryFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setGalleryFilter('all')}
                >
                  All Views ({property.gallery.length})
                </button>
                <button
                  type="button"
                  className={`bfa-gallery-filter-pill ${galleryFilter === 'outdoor' ? 'active' : ''}`}
                  onClick={() => setGalleryFilter('outdoor')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Icons8Icon name="building" variant="blue" size={14} />
                  Outdoor Views ({property.gallery.filter(i => i.category === 'outdoor').length})
                </button>
                <button
                  type="button"
                  className={`bfa-gallery-filter-pill ${galleryFilter === 'indoor' ? 'active' : ''}`}
                  onClick={() => setGalleryFilter('indoor')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Icons8Icon name="sofa" variant="blue" size={14} />
                  Indoor Living & Suites ({property.gallery.filter(i => i.category === 'indoor').length})
                </button>
              </div>

              {/* Main Photo Showcase View */}
              <div className="bfa-apt-main-viewer">
                <div
                  className="bfa-apt-viewer-image"
                  style={{ backgroundImage: `url(${activePhoto.image})` }}
                >
                  <div className="bfa-viewer-gradient" />
                  
                  {/* Category Pill Tag */}
                  <div className="bfa-viewer-category-tag">
                    {activePhoto.badge}
                  </div>

                  {/* Counter Badge */}
                  <div className="bfa-viewer-counter-badge">
                    {activeGalleryIndex + 1} / {filteredGallery.length}
                  </div>

                  {/* Next / Prev Navigation Arrows */}
                  <button
                    type="button"
                    className="bfa-viewer-nav-btn prev"
                    onClick={handlePrevPhoto}
                    aria-label="Previous image"
                    title="Previous (Left Arrow)"
                  >
                    <Icons8Icon name="chevron-left" variant="white" size={20} />
                  </button>
                  <button
                    type="button"
                    className="bfa-viewer-nav-btn next"
                    onClick={handleNextPhoto}
                    aria-label="Next image"
                    title="Next (Right Arrow)"
                  >
                    <Icons8Icon name="chevron-right" variant="white" size={20} />
                  </button>

                  {/* Bottom Image Caption */}
                  <div className="bfa-viewer-caption">
                    <h3 className="bfa-viewer-title">{activePhoto.title}</h3>
                    <p className="bfa-viewer-desc">{activePhoto.desc}</p>
                    <div className="bfa-viewer-disclaimer-tag" role="note">
                      <Icons8Icon name="info" variant="white" size={13} />
                      <span>Representative images — actual room appearance may vary.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Thumbnail Strip */}
              <div className="bfa-apt-thumb-strip">
                {filteredGallery.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`bfa-apt-thumb-item ${idx === activeGalleryIndex ? 'active' : ''}`}
                    onClick={() => setActiveGalleryIndex(idx)}
                    title={item.title}
                  >
                    <div
                      className="bfa-apt-thumb-img"
                      style={{ backgroundImage: `url(${item.image})` }}
                    />
                    <span className="bfa-thumb-label">{item.badge.split(' ')[1] || item.title}</span>
                  </div>
                ))}
              </div>

              {/* Quick Overview Summary */}
              <div className="bfa-apt-overview-card">
                <div className="bfa-overview-header">
                  <span className="bfa-pulse-dot" />
                  <h4>Executive Residence Summary — Akure, Ondo State</h4>
                </div>
                <p>{property.description}</p>
                <div className="bfa-overview-quick-badges">
                  <span className="bfa-quick-badge"><Icons8Icon name="lightning" variant="blue" size={16} /> 24/7 Guaranteed Power</span>
                  <span className="bfa-quick-badge"><Icons8Icon name="wifi" variant="blue" size={16} /> Fiber Wi-Fi 6</span>
                  <span className="bfa-quick-badge"><Icons8Icon name="shield-check" variant="blue" size={16} /> Biometric Security</span>
                  <span className="bfa-quick-badge"><Icons8Icon name="parking" variant="blue" size={16} /> Subterranean Parking</span>
                  <span className="bfa-quick-badge"><Icons8Icon name="swimming-pool" variant="blue" size={16} /> Swimming Pool & Sundeck</span>
                  <span className="bfa-quick-badge"><Icons8Icon name="kitchen" variant="blue" size={16} /> Chef Gourmet Kitchen</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: OUTDOOR & ARCHITECTURE */}
          {activeTab === 'outdoor' && (
            <div className="bfa-apt-tab-pane outdoor-pane">
              <div className="bfa-pane-hero-banner outdoor">
                <div className="bfa-pane-hero-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Icons8Icon name="building" variant="blue" size={16} /> Outdoor Grounds & Infrastructure
                </div>
                <h3>The Outdoor Experience at {property.name}</h3>
                <p>
                  Engineered for tranquility, uninterrupted power, and strict executive privacy in Akure, Ondo State.
                </p>
                <div className="bfa-viewer-disclaimer-tag" style={{ marginTop: '0.65rem' }} role="note">
                  <Icons8Icon name="info" variant="white" size={13} />
                  <span>Representative images — actual room appearance may vary.</span>
                </div>
              </div>

              {/* Outdoor Visual Highlights */}
              <div className="bfa-outdoor-visual-grid">
                <div
                  className="bfa-outdoor-photo-card"
                  style={{ backgroundImage: `url(${heroArchitecture})` }}
                >
                  <div className="bfa-photo-card-overlay">
                    <span className="bfa-card-tag">ARCHITECTURAL FACADE</span>
                    <h4>Contemporary High-Rise Structure</h4>
                    <p>Acoustic soundproof double-glazing, automated porte-cochère, and guarded reception entry.</p>
                  </div>
                </div>

                <div
                  className="bfa-outdoor-photo-card"
                  style={{ backgroundImage: `url(${aptTerraceWater})` }}
                >
                  <div className="bfa-photo-card-overlay">
                    <span className="bfa-card-tag">GROUNDS & RECREATION</span>
                    <h4>Resident Swimming Pool & Terrace</h4>
                    <p>Open-air pool deck, shaded cabanas, manicured gardens, and outdoor relaxation areas.</p>
                  </div>
                </div>
              </div>

              {/* Structured Outdoor Features Grid */}
              <div className="bfa-features-matrix-grid">
                {property.outdoorFeatures.map((feat, idx) => (
                  <div key={idx} className="bfa-matrix-feature-card">
                    <div className="bfa-feature-icon-badge">
                      <Icons8Icon name={feat.icon} variant="blue" size={24} />
                    </div>
                    <div className="bfa-feature-info">
                      <h4>{feat.title}</h4>
                      <p>{feat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: INDOOR LIVING & LUXURIES */}
          {activeTab === 'indoor' && (
            <div className="bfa-apt-tab-pane indoor-pane">
              <div className="bfa-pane-hero-banner indoor">
                <div className="bfa-pane-hero-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Icons8Icon name="sofa" variant="blue" size={16} /> Indoor Living & Suite Luxuries
                </div>
                <h3>Indoor Appointments & Comfort at {property.name}</h3>
                <p>
                  Every suite is individually appointed with imported Italian marble, bespoke furnishings, and luxury hotel-grade conveniences.
                </p>
                <div className="bfa-viewer-disclaimer-tag" style={{ marginTop: '0.65rem' }} role="note">
                  <Icons8Icon name="info" variant="white" size={13} />
                  <span>Representative images — actual room appearance may vary.</span>
                </div>
              </div>

              {/* Indoor Visual Showcase Grid */}
              <div className="bfa-indoor-visual-grid">
                <div
                  className="bfa-indoor-photo-box"
                  style={{ backgroundImage: `url(${aptLivingLuxury})` }}
                >
                  <div className="bfa-photo-box-caption">
                    <span className="box-badge">LOUNGE</span>
                    <strong>Executive Living Lounge</strong>
                  </div>
                </div>

                <div
                  className="bfa-indoor-photo-box"
                  style={{ backgroundImage: `url(${aptBedroomMaster})` }}
                >
                  <div className="bfa-photo-box-caption">
                    <span className="box-badge">BEDROOM</span>
                    <strong>Master King Suite</strong>
                  </div>
                </div>

                <div
                  className="bfa-indoor-photo-box"
                  style={{ backgroundImage: `url(${aptKitchenChef})` }}
                >
                  <div className="bfa-photo-box-caption">
                    <span className="box-badge">KITCHEN</span>
                    <strong>Chef's Gourmet Kitchen</strong>
                  </div>
                </div>

                <div
                  className="bfa-indoor-photo-box"
                  style={{ backgroundImage: `url(${aptBathroomSpa})` }}
                >
                  <div className="bfa-photo-box-caption">
                    <span className="box-badge">BATHROOM</span>
                    <strong>Luxury Spa Ensuite</strong>
                  </div>
                </div>
              </div>

              {/* Structured Indoor Features Grid */}
              <div className="bfa-features-matrix-grid">
                {property.indoorFeatures.map((feat, idx) => (
                  <div key={idx} className="bfa-matrix-feature-card">
                    <div className="bfa-feature-icon-badge">
                      <Icons8Icon name={feat.icon} variant="blue" size={24} />
                    </div>
                    <div className="bfa-feature-info">
                      <h4>{feat.title}</h4>
                      <p>{feat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: AVAILABLE RENTABLE UNITS */}
          {activeTab === 'units' && (
            <div className="bfa-apt-tab-pane units-pane">
              <div className="bfa-pane-hero-banner units">
                <div className="bfa-pane-hero-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Icons8Icon name="door" variant="blue" size={16} /> Real-Time Rentable Suites
                </div>
                <h3>Available Units at {property.name}</h3>
                <p>
                  Select a curated apartment unit to immediately inspect its specifications and reserve your stay.
                </p>
                <div className="bfa-viewer-disclaimer-tag" style={{ marginTop: '0.65rem' }} role="note">
                  <Icons8Icon name="info" variant="white" size={13} />
                  <span>Representative images — actual room appearance may vary.</span>
                </div>
              </div>

              <div className="bfa-modal-units-grid">
                {activeUnits.map((unit) => (
                  <div key={unit.id} className="bfa-modal-unit-card">
                    <div
                      className="bfa-modal-unit-visual"
                      style={{ backgroundImage: `url(${unit.image})` }}
                    >
                      <div className="bfa-unit-number-tag">Unit {unit.unitNumber}</div>
                      <div className="bfa-unit-status-tag">✓ {unit.status}</div>
                    </div>

                    <div className="bfa-modal-unit-body">
                      <div className="bfa-unit-top-info">
                        <h4 className="bfa-unit-title">{unit.unitName}</h4>
                        <span className="bfa-unit-type-pill">{unit.unitType}</span>
                      </div>

                      <div className="bfa-unit-specs-line" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Icons8Icon name="view-eye" variant="blue" size={14} />
                        <span>{unit.specs}</span>
                      </div>

                      <div className="bfa-unit-card-footer">
                        <div className="bfa-unit-rate-wrap">
                          <span className="rate-label">Per Night</span>
                          <span className="rate-num">{formatNaira(unit.rate)}</span>
                        </div>

                        <button
                          type="button"
                          className="bfa-unit-book-btn"
                          onClick={() => {
                            if (onSelectUnitAndBook) {
                              onSelectUnitAndBook(property.id, unit.id);
                            }
                            onClose();
                          }}
                        >
                          Book Unit →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer Actions */}
        <div className="bfa-apt-modal-footer">
          <div className="bfa-footer-left-info">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Icons8Icon name="location" variant="white" size={14} /> {property.name}
            </span>
            <span className="dot-sep">•</span>
            <span>Alagbaka & Ijapo, Akure, Ondo State</span>
          </div>

          <div className="bfa-footer-right-actions">
            <button
              type="button"
              className="bfa-modal-action-secondary"
              onClick={onClose}
            >
              Close Details
            </button>
            <button
              type="button"
              className="bfa-modal-action-primary"
              onClick={() => {
                if (onSelectUnitAndBook) {
                  onSelectUnitAndBook(property.id, property.units[0]?.id || 1);
                }
                onClose();
              }}
            >
              Reserve an Apartment Here →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

