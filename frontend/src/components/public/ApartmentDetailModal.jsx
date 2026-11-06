import React, { useState, useEffect } from 'react';
import { formatNaira } from '../../utils/currency';
import Icons8Icon from './Icons8Icon';
import './ApartmentDetailModal.css';

// Photography Assets — Building 1: Grand Horizon Tower (Alagbaka GRA)
import ghtExterior from '../../assets/ght-exterior.jpg';
import heroArchitecture from '../../assets/hero-architecture.jpg';
import aptLivingLuxury from '../../assets/apt-living-luxury.jpg';
import aptPenthouseView from '../../assets/apt-penthouse-view.jpg';
import aptInteriorWarm from '../../assets/apt-interior-warm.jpg';
import aptTerraceWater from '../../assets/apt-terrace-water.jpg';
import aptKitchenChef from '../../assets/apt-kitchen-chef.jpg';
import aptBedroomMaster from '../../assets/apt-bedroom-master.jpg';
import aptBathroomSpa from '../../assets/apt-bathroom-spa.jpg';
import ghDeluxeBedroom from '../../assets/gh-deluxe-bedroom.jpg';

// Photography Assets — Building 2: Azure Bay Residences (Ijapo Estate)
import azureBayExterior from '../../assets/azure-bay-exterior.jpg';
import azureBayPool from '../../assets/azure-bay-pool.jpg';
import azure201Living from '../../assets/azure-201-living.jpg';
import azure201Master from '../../assets/azure-201-master.jpg';
import azure201Kitchen from '../../assets/azure-201-kitchen.jpg';
import azure201Bathroom from '../../assets/azure-201-bathroom.jpg';

// Photography Assets — Building 3: The Royal Palms Suites (Oba-Ile)
import royalPalmsExterior from '../../assets/royal-palms-exterior.jpg';
import royalPalmsCourtyard from '../../assets/royal-palms-courtyard.jpg';
import royal301Living from '../../assets/royal-301-living.jpg';
import royal301Bedroom from '../../assets/royal-301-bedroom.jpg';

export const APARTMENTS_CATALOG = {
  1: {
    id: 1,
    name: 'Grand Horizon Tower',
    tagline: 'Serviced Residences • Alagbaka GRA, Akure',
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
        image: ghtExterior,
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
        id: 'ab-ext',
        category: 'outdoor',
        badge: '🏛️ Gated Villa Facade',
        title: 'Private Gated Entrance & Palms',
        desc: 'Quiet residential estate entrance with paved perimeter driveway, guarded security checkpoint, and tropical landscaping in Ijapo Estate.',
        image: azureBayExterior,
      },
      {
        id: 'ab-pool',
        category: 'outdoor',
        badge: '🏊 Resident Swimming Pool',
        title: 'Resident Courtyard Pool & Cabana',
        desc: 'Sparkling freshwater pool flanked by royal tropical palms, lounge chaises, and sheltered garden pavilion.',
        image: azureBayPool,
      },
      {
        id: 'ab-living',
        category: 'indoor',
        badge: '🛋️ Living Room Salon',
        title: 'Garden View Living Lounge',
        desc: 'Airy living space with floor-to-ceiling glass doors opening onto the courtyard garden, 65-inch Smart TV, and plush sectional seating.',
        image: azure201Living,
      },
      {
        id: 'ab-bed',
        category: 'indoor',
        badge: '🛏️ Master King Bedroom',
        title: 'Serene Master King Suite',
        desc: 'Warm wooden accents, custom king bed, premium memory foam mattress, bedside lamps, and serene greenery views.',
        image: azure201Master,
      },
      {
        id: 'ab-kitchen',
        category: 'indoor',
        badge: '🍳 Modern Fitted Kitchen',
        title: 'Modern Quartz Kitchen & Breakfast Bar',
        desc: 'Quartz countertops, breakfast bar with barstools, induction hobs, microwave, and full double-door refrigerator.',
        image: azure201Kitchen,
      },
      {
        id: 'ab-bath',
        category: 'indoor',
        badge: '🛁 Spa Ensuite Bathroom',
        title: 'Walk-In Glass Rain Shower',
        desc: 'Frameless glass walk-in rain shower, floating oak vanity, and high-pressure hot water systems.',
        image: azure201Bathroom,
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
        id: 4,
        unitNumber: '201',
        unitName: 'Azure Waterfront Suite 201',
        unitType: '2-Bedroom Luxury Suite',
        rate: '280000.00',
        specs: '2 King Beds • 2 Baths • 115m²',
        image: azure201Living,
        status: 'AVAILABLE',
      },
      {
        id: 5,
        unitNumber: '202',
        unitName: 'Bayside Studio 202',
        unitType: 'Studio Standard',
        rate: '140000.00',
        specs: '1 Queen Bed • 1 Bath • 40m²',
        image: azure201Master,
        status: 'AVAILABLE',
      },
      {
        id: 8,
        unitNumber: '203',
        unitName: 'Ocean Breeze Suite 203',
        unitType: '3-Bedroom Royal',
        rate: '450000.00',
        specs: '3 King Beds • 3 Baths • 160m²',
        image: azureBayPool,
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
        id: 'rp-ext',
        category: 'outdoor',
        badge: '🏛️ Stately Facade',
        title: 'Neoclassical Architecture & Portico',
        desc: 'Stately classical-modern serviced mansion with tall white columns along Presidential Boulevard, Oba-Ile.',
        image: royalPalmsExterior,
      },
      {
        id: 'rp-courtyard',
        category: 'outdoor',
        badge: '🌿 Stately Grounds',
        title: 'Grand Entrance Courtyard & Palms',
        desc: 'Circular paved entrance driveway with central water fountain, mature royal palm trees, and gated security.',
        image: royalPalmsCourtyard,
      },
      {
        id: 'rp-living',
        category: 'indoor',
        badge: '🛋️ Presidential Grand Salon',
        title: 'Presidential Salon with Navy & Gold Accents',
        desc: 'Double-height reception salon with custom Chesterfield leather sofa, marble coffee table, and ambient chandelier lighting.',
        image: royal301Living,
      },
      {
        id: 'rp-bed',
        category: 'indoor',
        badge: '🛏️ Executive Master Suite',
        title: 'Executive Master Bedroom Suite',
        desc: 'Stately tufted king bed with royal navy and gold cushions, rich carpeting, silk drapes, and bedside lighting.',
        image: royal301Bedroom,
      },
      {
        id: 'rp-bath',
        category: 'indoor',
        badge: '🛁 Luxury Spa Bath',
        title: 'Polished Ensuite Rain Shower',
        desc: 'High-pressure rainfall shower, designer porcelain tiling, and luxury toiletries.',
        image: azure201Bathroom,
      },
      {
        id: 'rp-terrace',
        category: 'outdoor',
        badge: '🌄 Panoramic Sky Terrace',
        title: 'Hillside Sunset Terrace',
        desc: 'Open-air balcony overlooking the picturesque hills of Akure and airport corridor.',
        image: aptPenthouseView,
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
  const pid = Number(propertyId || 1);

  // Property 2: Azure Bay Residences (Ijapo Estate)
  if (pid === 2) {
    if (t.includes('waterfront') || t.includes('luxury') || t.includes('2-bedroom')) {
      return azure201Living;
    }
    if (t.includes('studio') || t.includes('standard')) {
      return azure201Master;
    }
    if (t.includes('royal') || t.includes('3-bedroom') || t.includes('pool')) {
      return azureBayPool;
    }
    return azure201Living;
  }

  // Property 3: The Royal Palms Suites (Oba-Ile)
  if (pid === 3) {
    if (t.includes('presidential') || t.includes('deluxe') || t.includes('salon')) {
      return royal301Living;
    }
    if (t.includes('bedroom') || t.includes('suite') || t.includes('hillside')) {
      return royal301Bedroom;
    }
    return royal301Living;
  }

  // Property 1: Grand Horizon Tower (Alagbaka GRA)
  if (t.includes('penthouse') || t.includes('presidential') || t.includes('skyline')) {
    return aptPenthouseView;
  }
  if (t.includes('deluxe') || t.includes('1-bedroom')) {
    return ghDeluxeBedroom;
  }
  if (t.includes('2-bedroom') || t.includes('executive')) {
    return aptBedroomMaster;
  }
  if (t.includes('studio') || t.includes('standard') || t.includes('prime') || t.includes('minimalist')) {
    return aptInteriorWarm;
  }
  if (t.includes('lounge') || t.includes('salon')) {
    return aptLivingLuxury;
  }
  return heroArchitecture;
}

export function getPropertyPhoto(propertyId, code = '') {
  const pid = Number(propertyId);
  if (pid === 1 || code === 'GHT') return ghtExterior;
  if (pid === 2 || code === 'ABR') return azureBayExterior;
  if (pid === 3 || code === 'RPS') return royalPalmsExterior;
  const fallbackImages = [ghtExterior, azureBayExterior, royalPalmsExterior];
  return fallbackImages[((pid || 0) % fallbackImages.length)] || ghtExterior;
}

export function getRoomTypeGallery(unitType = '', property = {}) {
  const t = (unitType || '').toLowerCase();
  const pid = Number(property.id || 1);

  // Property 2: Azure Bay Residences Gallery
  if (pid === 2) {
    return [
      { id: 'ab-living', category: 'indoor', badge: '🛋️ Living Room Salon', title: 'Garden View Living Lounge', desc: 'Airy open-concept living space with 65-inch Smart TV, plush velvet sectional seating, and courtyard garden view.', image: azure201Living },
      { id: 'ab-bed', category: 'indoor', badge: '🛏️ Master King Bedroom', title: 'Serene Master King Suite', desc: 'Plush orthopaedic king mattress with premium Egyptian cotton, bedside reading lamps, and quiet estate greenery views.', image: azure201Master },
      { id: 'ab-kitchen', category: 'indoor', badge: '🍳 Modern Fitted Kitchen', title: 'Modern Quartz Kitchen & Breakfast Bar', desc: 'Quartz countertops, breakfast bar with barstools, induction hobs, microwave, and full double-door refrigerator.', image: azure201Kitchen },
      { id: 'ab-bath', category: 'indoor', badge: '🛁 Spa Ensuite Bathroom', title: 'Walk-In Glass Rain Shower', desc: 'Frameless glass walk-in rain shower with floating vanity, LED backlit mirror, and pressurized hot water.', image: azure201Bathroom },
      { id: 'ab-pool', category: 'outdoor', badge: '🏊 Resident Swimming Pool', title: 'Resident Courtyard Pool & Sun Loungers', desc: 'Exclusive resident freshwater pool with teakwood loungers, tropical palm trees, and outdoor relaxation cabana.', image: azureBayPool },
      { id: 'ab-ext', category: 'outdoor', badge: '🏛️ Gated Estate Facade', title: 'Private Gated Entrance & Palms', desc: 'Quiet residential estate entrance with paved perimeter driveway, guarded security checkpoint, and lush greenery.', image: azureBayExterior },
    ];
  }

  // Property 3: The Royal Palms Suites Gallery
  if (pid === 3) {
    return [
      { id: 'rp-living', category: 'indoor', badge: '🛋️ Presidential Grand Salon', title: 'Presidential Salon with Navy & Gold Accents', desc: 'Double-height reception salon with custom Chesterfield leather sofa, marble coffee table, and ambient chandelier lighting.', image: royal301Living },
      { id: 'rp-bed', category: 'indoor', badge: '🛏️ Executive Master Suite', title: 'Executive Master Bedroom Suite', desc: 'Stately tufted king bed with royal navy and gold cushions, rich carpeting, silk drapes, and bedside lighting.', image: royal301Bedroom },
      { id: 'rp-courtyard', category: 'outdoor', badge: '🌿 Stately Grounds', title: 'Grand Entrance Courtyard & Palms', desc: 'Circular paved entrance driveway with central water fountain, mature royal palm trees, and gated security.', image: royalPalmsCourtyard },
      { id: 'rp-ext', category: 'outdoor', badge: '🏛️ Stately Facade', title: 'Neoclassical Architecture & Portico', desc: 'Stately classical-modern serviced mansion with tall white columns along Presidential Boulevard, Oba-Ile.', image: royalPalmsExterior },
      { id: 'rp-bath', category: 'indoor', badge: '🛁 Luxury Spa Bath', title: 'Polished Ensuite Rain Shower', desc: 'High-pressure rainfall shower, designer porcelain tiling, and luxury toiletries.', image: azure201Bathroom },
      { id: 'rp-terrace', category: 'outdoor', badge: '🌄 Panoramic Sky Terrace', title: 'Hillside Sunset Terrace', desc: 'Open-air balcony overlooking the picturesque hills of Akure and airport corridor.', image: aptPenthouseView },
    ];
  }

  // Property 1: Grand Horizon Tower Gallery (Default)
  if (t.includes('penthouse') || t.includes('presidential')) {
    return [
      { id: 'ph-sky', category: 'outdoor', badge: '🌄 Private Sky Terrace', title: 'Private Penthouse Sky Terrace', desc: 'Sweeping panoramic views across Akure with open-air terrace seating.', image: aptPenthouseView },
      { id: 'ph-salon', category: 'indoor', badge: '🛋️ Palatial Grand Salon', title: 'Penthouse Reception Salon', desc: 'Double-height ceilings, designer furnishings, Italian marble, and bespoke ambient lighting.', image: aptLivingLuxury },
      { id: 'ph-bed', category: 'indoor', badge: '🛏️ Emperor Master Bedroom', title: 'Presidential Master Suite', desc: 'Handcrafted emperor mattress with luxury Egyptian linens and automated blackout curtains.', image: aptBedroomMaster },
      { id: 'ph-bath', category: 'indoor', badge: '🛁 Spa Ensuite Bathroom', title: 'Freestanding Soaking Tub Spa', desc: 'Deep soaking tub, twin vanities, and rain shower with imported Italian travertine.', image: aptBathroomSpa },
      { id: 'ph-kitchen', category: 'indoor', badge: '🍳 Gourmet Chef Kitchen', title: 'Appointed Chef Kitchen', desc: 'Granite-topped kitchen island, induction hobs, wine chiller, and microwave.', image: aptKitchenChef },
      { id: 'ph-pool', category: 'outdoor', badge: '🏊 Resident Infinity Pool', title: 'Terrace Plunge Pool & Sundeck', desc: 'Private outdoor infinity pool with landscaped palm gardens and sunbathing terrace.', image: aptTerraceWater },
    ];
  }
  if (t.includes('deluxe') || t.includes('1-bedroom')) {
    return [
      { id: 'gh-deluxe-bed', category: 'indoor', badge: '🛏️ Master Bedroom', title: 'Deluxe Suite Master Bedroom', desc: 'Panoramic hill view windows with orthopaedic king bed and floating nightstands.', image: ghDeluxeBedroom },
      { id: 'gh-living', category: 'indoor', badge: '🛋️ Living Area', title: 'Minimalist Suite Salon', desc: 'Warm oak finishes with comfortable lounge seating and smart entertainment.', image: aptInteriorWarm },
      { id: 'gh-bath', category: 'indoor', badge: '🛁 Spa Bathroom', title: 'Modern Travertine Ensuite', desc: 'Thermostatic rainfall shower with luxury toiletries and instant hot water.', image: aptBathroomSpa },
      { id: 'gh-ext', category: 'outdoor', badge: '🏛️ Building Facade', title: 'High-Rise Architectural Facade', desc: 'Striking modern high-rise architecture along Alagbaka GRA with acoustic soundproof double-glazing.', image: heroArchitecture },
      { id: 'gh-pool', category: 'outdoor', badge: '🏊 Resident Pool', title: 'Resident Infinity Pool', desc: 'Rooftop freshwater infinity pool with private cabana loungers.', image: aptTerraceWater },
    ];
  }
  if (t.includes('2-bedroom') || t.includes('executive')) {
    return [
      { id: 'ex-bed', category: 'indoor', badge: '🛏️ Master King Suite', title: 'Executive Master Bedroom', desc: 'Deep-plush king mattress with acoustic sound insulation and dressing wardrobe.', image: aptBedroomMaster },
      { id: 'ex-salon', category: 'indoor', badge: '🛋️ Executive Living Salon', title: 'Spacious Salon Lounge', desc: 'Custom Italian furnishings with 4K Smart entertainment system.', image: aptLivingLuxury },
      { id: 'ex-kitchen', category: 'indoor', badge: '🍳 Chef Kitchen', title: 'Granite Countertop Kitchen', desc: 'Equipped with induction hobs, oven, and double-door refrigerator.', image: aptKitchenChef },
      { id: 'ex-bath', category: 'indoor', badge: '🛁 Ensuite Bathroom', title: 'Luxury Marble Ensuite', desc: 'Thermostatic rain shower and illuminated vanity mirrors.', image: aptBathroomSpa },
      { id: 'ex-terrace', category: 'outdoor', badge: '🌄 Private Balcony', title: 'Scenic Balcony', desc: 'Outdoor balcony with panoramic estate views.', image: aptTerraceWater },
    ];
  }
  if (t.includes('studio') || t.includes('standard') || t.includes('prime')) {
    return [
      { id: 'st-work', category: 'indoor', badge: '💼 Studio Interior & Workspace', title: 'Studio Premier Suite & Workspace', desc: 'Quiet minimalist suite equipped with ergonomic workstation and fiber Wi-Fi 6.', image: aptInteriorWarm },
      { id: 'st-lounge', category: 'indoor', badge: '🛋️ Living Nook', title: 'Studio Living Area', desc: 'Compact luxury living area with Smart TV and designer seating.', image: aptLivingLuxury },
      { id: 'st-bed', category: 'indoor', badge: '🛏️ Master King Bed', title: 'Plush Suite Bedding', desc: 'Orthopaedic mattress with hypoallergenic duvets and mood lighting.', image: ghDeluxeBedroom },
      { id: 'st-bath', category: 'indoor', badge: '🛁 Ensuite Shower', title: 'Modern Rain Shower', desc: 'Walk-in shower enclosure with instant pressurized hot water.', image: aptBathroomSpa },
      { id: 'st-ext', category: 'outdoor', badge: '🏛️ Building Facade', title: 'High-Rise Architectural Facade', desc: 'Striking modern high-rise architecture along Alagbaka GRA with acoustic soundproof double-glazing.', image: heroArchitecture },
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

export function getApartmentInternalSpaces(unitType = '', propertyId = 1) {
  const t = (unitType || '').toLowerCase();
  const pid = Number(propertyId || 1);

  // 1. Studio / Single-Zone Suite (Do NOT force into multi-room structure!)
  if (t.includes('studio') || t.includes('standard') || t.includes('prime') || t.includes('single')) {
    return {
      structureType: 'Single-Zone Serviced Studio Suite',
      badge: '🔑 Serviced Studio Suite',
      isMultiRoom: false,
      summary: 'Architecturally designed as an integrated single-zone executive sanctuary. Living, sleeping, and workstation are unified into one spacious open-concept layout with an independent private ensuite bathroom.',
      spaces: [
        {
          id: 'sp-studio-main',
          name: 'Studio Living & Master Sleeping Zone',
          type: 'Living & Bedroom Combined',
          desc: 'Open-concept studio living space with plush king/queen bed, reading armchair, ergonomic work desk, and 50" 4K Smart TV.',
          photo: pid === 2 ? azure201Master : (pid === 3 ? royal301Bedroom : aptInteriorWarm),
          specs: 'King/Queen Bed • Workstation • Smart Climate Control',
          amenities: ['Orthopaedic Bedding', 'Fiber Wi-Fi 6', 'Dedicated Work Desk', '50" 4K Smart TV', 'Inverter AC'],
        },
        {
          id: 'sp-studio-bath',
          name: 'Private Ensuite Bathroom',
          type: 'Ensuite Bathroom',
          desc: 'Private enclosed bathroom with high-pressure rainfall shower, modern vanity mirror, and instant hot water.',
          photo: pid === 2 ? azure201Bathroom : (pid === 3 ? azure201Bathroom : aptBathroomSpa),
          specs: 'Walk-In Rain Shower • Designer Vanity',
          amenities: ['Thermostatic Rain Shower', 'Instant Hot Water', 'Designer Toiletries', 'LED Vanity Mirror'],
        },
        {
          id: 'sp-studio-kitchen',
          name: 'Studio Kitchenette',
          type: 'Kitchenette',
          desc: 'Compact refreshment and meal-prep area with microwave, mini-refrigerator, electric kettle, and dinnerware.',
          photo: pid === 2 ? azure201Kitchen : aptKitchenChef,
          specs: 'Microwave • Mini-Fridge • Tea/Coffee Station',
          amenities: ['Microwave Oven', 'Compact Refrigerator', 'Electric Kettle', 'Coffee & Tea Station'],
        },
      ],
    };
  }

  // 2. 1-Bedroom Executive Suite
  if (t.includes('deluxe') || t.includes('1-bedroom')) {
    return {
      structureType: '1-Bedroom Executive Suite',
      badge: '🛋️ 1-Bedroom Executive Suite',
      isMultiRoom: true,
      summary: 'Features an independent living salon separated by architectural doors from the private master king bedroom suite, plus an executive kitchenette and spa bathroom.',
      spaces: [
        {
          id: 'sp-1bed-salon',
          name: 'Independent Living Salon',
          type: 'Living Salon',
          desc: 'Private salon lounge separated from the bedroom, equipped with a designer sofa, 55" Smart TV, and coffee table.',
          photo: pid === 2 ? azure201Living : (pid === 3 ? royal301Living : aptLivingLuxury),
          specs: 'Executive Lounge • 55" 4K Smart TV • Inverter AC',
          amenities: ['Designer Sectional', '55" 4K TV with Netflix', 'Inverter Climate Control', 'Ambient Lighting'],
        },
        {
          id: 'sp-1bed-master',
          name: 'Master King Bedroom Suite',
          type: 'Enclosed Bedroom',
          desc: 'Enclosed master bedroom with plush king mattress, automated blackout drapes, and bedside lighting.',
          photo: pid === 2 ? azure201Master : (pid === 3 ? royal301Bedroom : ghDeluxeBedroom),
          specs: 'King Bed • Walk-In Wardrobe • Acoustic Insulation',
          amenities: ['Orthopaedic King Bed', '600-Thread Linens', 'Acoustic Soundproofing', 'Automated Blackout Curtains'],
        },
        {
          id: 'sp-1bed-kitchen',
          name: 'Fitted Kitchenette & Dining Nook',
          type: 'Kitchenette',
          desc: 'Modern kitchen counter with induction hobs, microwave, refrigerator, and 2-guest breakfast bar.',
          photo: pid === 2 ? azure201Kitchen : aptKitchenChef,
          specs: 'Induction Hob • Microwave • Breakfast Bar',
          amenities: ['Induction Cooktop', 'Microwave', 'Refrigerator', 'Dining Barstools'],
        },
        {
          id: 'sp-1bed-bath',
          name: 'Spa Ensuite Bathroom',
          type: 'Ensuite Bathroom',
          desc: 'Imported porcelain ensuite with frameless rainfall shower, illuminated mirror, and organic bath essentials.',
          photo: pid === 2 ? azure201Bathroom : (pid === 3 ? azure201Bathroom : aptBathroomSpa),
          specs: 'Rain Shower • Soaking Hot Water',
          amenities: ['Rainfall Shower Enclosure', 'Instant Pressurized Hot Water', 'Hairdryer & Bathrobes'],
        },
      ],
    };
  }

  // 3. Multi-Room Serviced Apartment (2-Bedroom / 3-Bedroom / Luxury Suite)
  if (t.includes('2-bedroom') || t.includes('3-bedroom') || t.includes('waterfront') || t.includes('luxury') || t.includes('executive')) {
    return {
      structureType: 'Multi-Room Serviced Apartment',
      badge: '🏢 Multi-Room Serviced Apartment',
      isMultiRoom: true,
      summary: 'A complete residential home layout featuring separate reception salon, formal dining room, multiple master and guest bedroom suites, full chef kitchen, and private balconies.',
      spaces: [
        {
          id: 'sp-multi-salon',
          name: 'Grand Living Salon & Dining Area',
          type: 'Living & Dining Room',
          desc: 'Expansive family and executive salon with large plush seating, 65" 4K Smart TV, and formal dining table seating 6.',
          photo: pid === 2 ? azure201Living : (pid === 3 ? royal301Living : aptLivingLuxury),
          specs: 'Italian Marble • Formal Dining for 6 • 65" 4K TV',
          amenities: ['Plush Velvet Sectional', '6-Guest Dining Suite', 'Bang & Olufsen Soundbar', 'Wine Storage'],
        },
        {
          id: 'sp-multi-master',
          name: 'Primary Master Bedroom Suite',
          type: 'Master Bedroom (Ensuite)',
          desc: 'Palatial master bedroom with orthopaedic king mattress, custom dressing area, and private ensuite travertine bath.',
          photo: pid === 2 ? azure201Master : (pid === 3 ? royal301Bedroom : aptBedroomMaster),
          specs: 'King Bed • Ensuite Bath • Garden/Skyline Views',
          amenities: ['King Bed with Egyptian Cotton', 'Dedicated Dressing Wardrobe', 'Acoustic Soundproofing', 'Private Ensuite'],
        },
        {
          id: 'sp-multi-second',
          name: 'Second Bedroom Suite',
          type: 'Secondary Bedroom',
          desc: 'Full-sized second bedroom with orthopaedic bed, reading lamps, and built-in wardrobes.',
          photo: pid === 2 ? azure201Master : (pid === 3 ? royal301Bedroom : ghDeluxeBedroom),
          specs: 'Queen/King Bed • Separate AC Zone',
          amenities: ['Orthopaedic Mattress', 'Double Wardrobe', 'Bedside USB Sockets', 'Independent AC'],
        },
        {
          id: 'sp-multi-kitchen',
          name: 'Full Gourmet Chef Kitchen',
          type: 'Gourmet Kitchen',
          desc: 'Spacious fitted kitchen with quartz/granite countertops, induction cooktop, double-door refrigerator, and cookware.',
          photo: pid === 2 ? azure201Kitchen : aptKitchenChef,
          specs: 'Double-Door Fridge • Oven & Microwave • Induction Island',
          amenities: ['Induction Island', 'Double-Door Refrigerator', 'Oven & Microwave', 'Complete Cookware & Stemware'],
        },
        {
          id: 'sp-multi-baths',
          name: 'Spa Ensuites & Guest Powder Room',
          type: 'Multiple Bathrooms (2+ Baths)',
          desc: 'Multiple luxury bathrooms featuring deep soaking bathtubs and frameless glass rainfall showers.',
          photo: pid === 2 ? azure201Bathroom : (pid === 3 ? azure201Bathroom : aptBathroomSpa),
          specs: 'Deep Soaking Tub • Twin Vanities • Instant Hot Water',
          amenities: ['Deep Soaking Tub', 'Glass Rain Shower', 'Twin Vanity', 'Organic Bath Amenities'],
        },
        {
          id: 'sp-multi-balcony',
          name: 'Private Verandah / Scenic Balcony',
          type: 'Outdoor Balcony',
          desc: 'Covered outdoor balcony with comfortable outdoor seating overlooking the estate grounds or pool pavilion.',
          photo: pid === 2 ? azureBayPool : (pid === 3 ? royalPalmsCourtyard : aptTerraceWater),
          specs: 'Private Outdoor Terrace • Scenic Views',
          amenities: ['Outdoor Armchairs', 'Estate & Garden Views', 'Evening Ambient Lighting'],
        },
      ],
    };
  }

  // 4. Presidential Penthouse Apartment
  return {
    structureType: 'Presidential Penthouse Apartment',
    badge: '👑 Presidential Penthouse Apartment',
    isMultiRoom: true,
    summary: 'The ultimate serviced penthouse experience with double-height salon, multiple presidential master suites, bespoke chef kitchen, and private panoramic skyline terrace.',
    spaces: [
      {
        id: 'sp-ph-salon',
        name: 'Double-Height Presidential Salon',
        type: 'Grand Salon Lounge',
        desc: 'Stately reception salon with double-height ceiling, bespoke custom sofas, chandelier lighting, and 85" 4K theater system.',
        photo: pid === 3 ? royal301Living : aptLivingLuxury,
        specs: 'Double-Height Ceilings • Chandelier • 85" 4K OLED',
        amenities: ['85" 4K OLED Theater', 'Chesterfield Seating', 'Chandelier Lighting', 'Reception Wet Bar'],
      },
      {
        id: 'sp-ph-master',
        name: 'Emperor Master Bedroom Suite',
        type: 'Emperor Master Bedroom',
        desc: 'Handcrafted emperor mattress with luxury Egyptian cotton, walk-in dressing salon, and automated blackout curtains.',
        photo: pid === 3 ? royal301Bedroom : aptBedroomMaster,
        specs: 'Emperor Bed • Walk-in Dressing Salon',
        amenities: ['Handcrafted Emperor Bed', 'Walk-in Dressing Salon', 'Automated Blackout Curtains', 'Butler Service Station'],
      },
      {
        id: 'sp-ph-bath',
        name: 'Italian Travertine Spa Ensuite',
        type: 'Spa Ensuite Bathroom',
        desc: 'Freestanding soaking tub overlooking panoramic vistas, twin vanities, and multi-jet thermostatic rain shower.',
        photo: pid === 2 ? azure201Bathroom : aptBathroomSpa,
        specs: 'Freestanding Soaking Tub • Twin Vanities',
        amenities: ['Freestanding Bath', 'Multi-Jet Rain Shower', 'Heated Towel Warmers', 'Complimentary Bottega Veneta Toiletries'],
      },
      {
        id: 'sp-ph-kitchen',
        name: 'Executive Chef Kitchen',
        type: 'Chef Kitchen',
        desc: 'Fully appointed culinary kitchen with wine chiller, induction hobs, double ovens, and private chef preparation area.',
        photo: pid === 2 ? azure201Kitchen : aptKitchenChef,
        specs: 'Wine Chiller • Chef Induction Island',
        amenities: ['Wine Chiller', 'Induction Island', 'Double Oven', 'Espresso Machine'],
      },
      {
        id: 'sp-ph-terrace',
        name: 'Private Skyline Sun Terrace',
        type: 'Panoramic Sky Terrace',
        desc: 'Expansive private open-air terrace with lounge chaises and panoramic sunset views across the hills of Ondo State.',
        photo: pid === 3 ? royalPalmsExterior : aptPenthouseView,
        specs: 'Panoramic 360° Hillside Views • Sun Deck',
        amenities: ['Outdoor Sun Deck', 'Lounge Chaises', 'Sunset Panorama', 'Private Open-Air Dining'],
      },
    ],
  };
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

  const internalSpaces = getApartmentInternalSpaces(
    roomTypeData ? roomTypeData.unitType : (property.units?.[0]?.unitType || 'Apartment'),
    property.id
  );

  const buildingOutdoor = (() => {
    const pid = Number(property.id || 1);
    if (pid === 2) {
      return {
        ext: azureBayExterior,
        extTag: 'GATED VILLA FACADE',
        extTitle: 'Contemporary Gated Tropical Villa',
        extDesc: 'Quiet residential estate entrance with paved perimeter driveway, guarded security checkpoint, and tropical landscaping in Ijapo Estate.',
        grounds: azureBayPool,
        groundsTag: 'RESIDENT POOL & CABANAS',
        groundsTitle: 'Resident Courtyard Swimming Pool & Cabanas',
        groundsDesc: 'Sparkling freshwater pool flanked by royal tropical palms, teakwood loungers, and sheltered garden pavilion.',
      };
    }
    if (pid === 3) {
      return {
        ext: royalPalmsExterior,
        extTag: 'NEOCLASSICAL FACADE',
        extTitle: 'Neoclassical Architecture & Grand Portico',
        extDesc: 'Stately classical-modern serviced mansion with tall white columns along Presidential Boulevard, Oba-Ile.',
        grounds: royalPalmsCourtyard,
        groundsTag: 'STATELY GROUNDS & PALMS',
        groundsTitle: 'Grand Fountain Courtyard & Mature Royal Palms',
        groundsDesc: 'Circular paved entrance driveway with central water fountain, mature royal palm trees, and gated security checkpoint.',
      };
    }
    return {
      ext: heroArchitecture,
      extTag: 'ARCHITECTURAL FACADE',
      extTitle: 'Contemporary High-Rise Structure',
      extDesc: 'Acoustic soundproof double-glazing, automated porte-cochère, and guarded reception entry along Alagbaka GRA.',
      grounds: aptTerraceWater,
      groundsTag: 'GROUNDS & RECREATION',
      groundsTitle: 'Resident Infinity Swimming Pool & Terrace',
      groundsDesc: 'Open-air pool deck, shaded cabanas, manicured tropical gardens, and outdoor relaxation areas.',
    };
  })();

  const buildingIndoor = (() => {
    const pid = Number(property.id || 1);
    if (pid === 2) {
      return {
        lounge: azure201Living,
        loungeTitle: 'Garden View Living Lounge',
        bed: azure201Master,
        bedTitle: 'Serene Master King Suite',
        kitchen: azure201Kitchen,
        kitchenTitle: 'Modern Quartz Kitchen & Breakfast Bar',
        bath: azure201Bathroom,
        bathTitle: 'Walk-In Glass Rain Shower',
      };
    }
    if (pid === 3) {
      return {
        lounge: royal301Living,
        loungeTitle: 'Presidential Double-Height Salon',
        bed: royal301Bedroom,
        bedTitle: 'Executive Master Bedroom Suite',
        kitchen: aptKitchenChef,
        kitchenTitle: 'Executive Chef Kitchen',
        bath: azure201Bathroom,
        bathTitle: 'Polished Ensuite Rain Shower',
      };
    }
    return {
      lounge: aptLivingLuxury,
      loungeTitle: 'Executive Living Lounge',
      bed: ghDeluxeBedroom,
      bedTitle: 'Master King Suite',
      kitchen: aptKitchenChef,
      kitchenTitle: "Chef's Gourmet Kitchen",
      bath: aptBathroomSpa,
      bathTitle: 'Luxury Spa Ensuite',
    };
  })();

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
            className={`bfa-apt-tab-btn ${activeTab === 'spaces' ? 'active' : ''}`}
            onClick={() => setActiveTab('spaces')}
          >
            <Icons8Icon name="sofa" variant={activeTab === 'spaces' ? 'blue' : 'white'} size={18} />
            <span>Internal Rooms & Spaces ({internalSpaces.spaces.length})</span>
          </button>
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
            <Icons8Icon name="lightning" variant={activeTab === 'indoor' ? 'blue' : 'white'} size={18} />
            <span>Building Luxuries & Amenities</span>
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
          {/* TAB 0: INTERNAL ROOMS & SPACES BREAKDOWN */}
          {activeTab === 'spaces' && (
            <div className="bfa-apt-tab-pane spaces-pane">
              <div className="bfa-structure-type-banner">
                <span className="bfa-structure-type-badge">{internalSpaces.badge}</span>
                <h3 className="bfa-structure-type-title">
                  {internalSpaces.structureType} — {roomTypeData ? roomTypeData.unitType : property.name}
                </h3>
                <p className="bfa-structure-type-summary">{internalSpaces.summary}</p>
                <div className="bfa-viewer-disclaimer-tag" style={{ marginTop: '0.65rem' }} role="note">
                  <Icons8Icon name="info" variant="white" size={13} />
                  <span>Representative demonstration images — actual room appearance and layout may vary.</span>
                </div>
              </div>

              {/* Grid of Itemized Internal Spaces */}
              <div className="bfa-spaces-matrix-grid">
                {internalSpaces.spaces.map((sp) => (
                  <div key={sp.id} className="bfa-space-card">
                    <div
                      className="bfa-space-card-visual"
                      style={{ backgroundImage: `url(${sp.photo})` }}
                    >
                      <div className="bfa-space-card-overlay" />
                      <span className="bfa-space-card-badge">{sp.type}</span>
                    </div>

                    <div className="bfa-space-card-body">
                      <h4 className="bfa-space-card-title">{sp.name}</h4>
                      <div className="bfa-space-specs-chip">
                        <Icons8Icon name="view-eye" variant="blue" size={13} />
                        <span>{sp.specs}</span>
                      </div>
                      <p className="bfa-space-card-desc">{sp.desc}</p>

                      <div className="bfa-space-amenities-wrap">
                        {sp.amenities.map((am, i) => (
                          <span key={i} className="bfa-space-amenity-pill">
                            ✓ {am}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                  style={{ backgroundImage: `url(${buildingOutdoor.ext})` }}
                >
                  <div className="bfa-photo-card-overlay">
                    <span className="bfa-card-tag">{buildingOutdoor.extTag}</span>
                    <h4>{buildingOutdoor.extTitle}</h4>
                    <p>{buildingOutdoor.extDesc}</p>
                  </div>
                </div>

                <div
                  className="bfa-outdoor-photo-card"
                  style={{ backgroundImage: `url(${buildingOutdoor.grounds})` }}
                >
                  <div className="bfa-photo-card-overlay">
                    <span className="bfa-card-tag">{buildingOutdoor.groundsTag}</span>
                    <h4>{buildingOutdoor.groundsTitle}</h4>
                    <p>{buildingOutdoor.groundsDesc}</p>
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
                  style={{ backgroundImage: `url(${buildingIndoor.lounge})` }}
                >
                  <div className="bfa-photo-box-caption">
                    <span className="box-badge">LOUNGE</span>
                    <strong>{buildingIndoor.loungeTitle}</strong>
                  </div>
                </div>

                <div
                  className="bfa-indoor-photo-box"
                  style={{ backgroundImage: `url(${buildingIndoor.bed})` }}
                >
                  <div className="bfa-photo-box-caption">
                    <span className="box-badge">BEDROOM</span>
                    <strong>{buildingIndoor.bedTitle}</strong>
                  </div>
                </div>

                <div
                  className="bfa-indoor-photo-box"
                  style={{ backgroundImage: `url(${buildingIndoor.kitchen})` }}
                >
                  <div className="bfa-photo-box-caption">
                    <span className="box-badge">KITCHEN</span>
                    <strong>{buildingIndoor.kitchenTitle}</strong>
                  </div>
                </div>

                <div
                  className="bfa-indoor-photo-box"
                  style={{ backgroundImage: `url(${buildingIndoor.bath})` }}
                >
                  <div className="bfa-photo-box-caption">
                    <span className="box-badge">BATHROOM</span>
                    <strong>{buildingIndoor.bathTitle}</strong>
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

