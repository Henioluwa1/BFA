import React from 'react';

// Icons8 assets downloaded directly from Icons8 Fluent & Flat Color catalogue
import buildingWhite from '../../assets/icons8/building-white.png';
import buildingBlue from '../../assets/icons8/building-blue.png';
import waterWhite from '../../assets/icons8/water-white.png';
import waterBlue from '../../assets/icons8/water-blue.png';
import palmTreeWhite from '../../assets/icons8/palm-tree-white.png';
import palmTreeBlue from '../../assets/icons8/palm-tree-blue.png';
import galleryWhite from '../../assets/icons8/gallery-white.png';
import galleryBlue from '../../assets/icons8/gallery-blue.png';
import calendarWhite from '../../assets/icons8/calendar-white.png';
import calendarBlue from '../../assets/icons8/calendar-blue.png';
import shieldCheckWhite from '../../assets/icons8/shield-check-white.png';
import shieldCheckBlue from '../../assets/icons8/shield-check-blue.png';
import lightningWhite from '../../assets/icons8/lightning-white.png';
import lightningBlue from '../../assets/icons8/lightning-blue.png';
import phoneWhite from '../../assets/icons8/phone-white.png';
import phoneBlue from '../../assets/icons8/phone-blue.png';

import searchWhite from '../../assets/icons8/search-white.png';
import searchBlue from '../../assets/icons8/search-blue.png';
import wallpaperWhite from '../../assets/icons8/wallpaper-white.png';
import wallpaperBlue from '../../assets/icons8/wallpaper-blue.png';
import menuWhite from '../../assets/icons8/menu-white.png';
import menuBlue from '../../assets/icons8/menu-blue.png';
import closeWhite from '../../assets/icons8/close-white.png';
import closeBlue from '../../assets/icons8/close-blue.png';
import loginWhite from '../../assets/icons8/login-white.png';
import loginBlue from '../../assets/icons8/login-blue.png';
import chatWhite from '../../assets/icons8/chat-white.png';
import chatBlue from '../../assets/icons8/chat-blue.png';
import locationWhite from '../../assets/icons8/location-white.png';
import locationBlue from '../../assets/icons8/location-blue.png';
import viewEyeWhite from '../../assets/icons8/view-eye-white.png';
import viewEyeBlue from '../../assets/icons8/view-eye-blue.png';

import chevronDownWhite from '../../assets/icons8/chevron-down-white.png';
import chevronDownBlue from '../../assets/icons8/chevron-down-blue.png';
import chevronLeftWhite from '../../assets/icons8/chevron-left-white.png';
import chevronLeftBlue from '../../assets/icons8/chevron-left-blue.png';
import chevronRightWhite from '../../assets/icons8/chevron-right-white.png';
import chevronRightBlue from '../../assets/icons8/chevron-right-blue.png';

import wifiWhite from '../../assets/icons8/wifi-white.png';
import wifiBlue from '../../assets/icons8/wifi-blue.png';
import cleaningWhite from '../../assets/icons8/cleaning-white.png';
import cleaningBlue from '../../assets/icons8/cleaning-blue.png';
import maintenanceWhite from '../../assets/icons8/maintenance-white.png';
import maintenanceBlue from '../../assets/icons8/maintenance-blue.png';
import parkingWhite from '../../assets/icons8/parking-white.png';
import parkingBlue from '../../assets/icons8/parking-blue.png';

import creditCardWhite from '../../assets/icons8/credit-card-white.png';
import creditCardBlue from '../../assets/icons8/credit-card-blue.png';
import bankWhite from '../../assets/icons8/bank-white.png';
import bankBlue from '../../assets/icons8/bank-blue.png';
import mobilePhoneWhite from '../../assets/icons8/mobile-phone-white.png';
import mobilePhoneBlue from '../../assets/icons8/mobile-phone-blue.png';

import bedWhite from '../../assets/icons8/bed-white.png';
import bedBlue from '../../assets/icons8/bed-blue.png';
import sofaWhite from '../../assets/icons8/sofa-white.png';
import sofaBlue from '../../assets/icons8/sofa-blue.png';
import doorWhite from '../../assets/icons8/door-white.png';
import doorBlue from '../../assets/icons8/door-blue.png';
import swimmingPoolWhite from '../../assets/icons8/swimming-pool-white.png';
import swimmingPoolBlue from '../../assets/icons8/swimming-pool-blue.png';
import kitchenWhite from '../../assets/icons8/kitchen-white.png';
import kitchenBlue from '../../assets/icons8/kitchen-blue.png';
import bathWhite from '../../assets/icons8/bath-white.png';
import bathBlue from '../../assets/icons8/bath-blue.png';

import weatherPartlyCloudy from '../../assets/icons8/weather-partly-cloudy.png';

const ICON_MAP = {
  building: { white: buildingWhite, blue: buildingBlue },
  water: { white: waterWhite, blue: waterBlue },
  'palm-tree': { white: palmTreeWhite, blue: palmTreeBlue },
  gallery: { white: galleryWhite, blue: galleryBlue },
  calendar: { white: calendarWhite, blue: calendarBlue },
  'shield-check': { white: shieldCheckWhite, blue: shieldCheckBlue },
  lightning: { white: lightningWhite, blue: lightningBlue },
  phone: { white: phoneWhite, blue: phoneBlue },

  search: { white: searchWhite, blue: searchBlue },
  wallpaper: { white: wallpaperWhite, blue: wallpaperBlue },
  menu: { white: menuWhite, blue: menuBlue },
  close: { white: closeWhite, blue: closeBlue },
  login: { white: loginWhite, blue: loginBlue },
  chat: { white: chatWhite, blue: chatBlue },
  location: { white: locationWhite, blue: locationBlue },
  'view-eye': { white: viewEyeWhite, blue: viewEyeBlue },

  'chevron-down': { white: chevronDownWhite, blue: chevronDownBlue },
  'chevron-left': { white: chevronLeftWhite, blue: chevronLeftBlue },
  'chevron-right': { white: chevronRightWhite, blue: chevronRightBlue },

  wifi: { white: wifiWhite, blue: wifiBlue },
  cleaning: { white: cleaningWhite, blue: cleaningBlue },
  maintenance: { white: maintenanceWhite, blue: maintenanceBlue },
  parking: { white: parkingWhite, blue: parkingBlue },

  bed: { white: bedWhite, blue: bedBlue },
  sofa: { white: sofaWhite, blue: sofaBlue },
  door: { white: doorWhite, blue: doorBlue },
  'swimming-pool': { white: swimmingPoolWhite, blue: swimmingPoolBlue },
  kitchen: { white: kitchenWhite, blue: kitchenBlue },
  bath: { white: bathWhite, blue: bathBlue },

  'credit-card': { white: creditCardWhite, blue: creditCardBlue },
  bank: { white: bankWhite, blue: bankBlue },
  'mobile-phone': { white: mobilePhoneWhite, blue: mobilePhoneBlue },

  weather: { white: weatherPartlyCloudy, blue: weatherPartlyCloudy, default: weatherPartlyCloudy }
};

export default function Icons8Icon({
  name,
  variant = 'white',
  size = 20,
  className = '',
  alt = ''
}) {
  const iconEntry = ICON_MAP[name];
  if (!iconEntry) return null;

  const src = iconEntry[variant] || iconEntry.white || iconEntry.default;

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`bfa-icons8-icon ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'inline-block',
        verticalAlign: 'middle',
        objectFit: 'contain',
        flexShrink: 0
      }}
      loading="lazy"
    />
  );
}
