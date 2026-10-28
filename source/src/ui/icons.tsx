import type { ReactNode, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const make = (paths: ReactNode) =>
  function Icon({ size = 20, ...rest }: P) {
    return (
      <svg className="ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
        {paths}
      </svg>
    );
  };

export const IconSpark = make(<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z" />);
export const IconLayout = make(<><path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></>);
export const IconSliders = make(<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>);
export const IconCheckSquare = make(<><rect x="3" y="3" width="18" height="18" rx="5" /><path d="m8 12 3 3 5-6" /></>);
export const IconNote = make(<><path d="M5 3h10l4 4v14H5z" /><path d="M9 12h6M9 16h4" /></>);
export const IconTimer = make(<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></>);
export const IconCalendar = make(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
export const IconClock = make(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconSearch = make(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconGrid = make(<><rect x="4" y="4" width="6" height="6" rx="2" /><rect x="14" y="4" width="6" height="6" rx="2" /><rect x="4" y="14" width="6" height="6" rx="2" /><rect x="14" y="14" width="6" height="6" rx="2" /></>);
export const IconPlus = make(<path d="M12 5v14M5 12h14" />);
export const IconX = make(<path d="M6 6l12 12M18 6 6 18" />);
export const IconTrash = make(<><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>);
export const IconChevronR = make(<path d="m9 6 6 6-6 6" />);
export const IconChevronL = make(<path d="m15 6-6 6 6 6" />);
export const IconReset = make(<path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4" />);
export const IconPlay = make(<path d="M8 5v14l11-7z" />);
export const IconPause = make(<path d="M8 5v14M16 5v14" />);
export const IconUpload = make(<path d="M12 16V4M7 9l5-5 5 5M4 20h16" />);
export const IconDownload = make(<path d="M12 4v12M7 11l5 5 5-5M4 20h16" />);
export const IconFlag = make(<path d="M5 21V4M5 4h11l-2 4 2 4H5" />);
export const IconResize = make(<path d="M4 20 20 4M4 13l7 7M4 20h7" />);
export const IconSun = make(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
export const IconMoon = make(<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />);
export const IconCloud = make(<path d="M17 18H8a4.5 4.5 0 1 1 .9-8.9A5.5 5.5 0 0 1 19 11a3.5 3.5 0 0 1-2 7z" />);
export const IconCloudSun = make(<><path d="M9 3v1.5M3.5 8.5H5M4.8 4.3l1 1M14.2 4.3l-1 1" /><path d="M6.5 11a3.5 3.5 0 0 1 6.2-2.2" /><path d="M17.5 20H9a3.5 3.5 0 1 1 .7-6.9A4.5 4.5 0 0 1 18.5 14a3 3 0 0 1-1 6z" /></>);
export const IconRain = make(<><path d="M17 15H8a4.5 4.5 0 1 1 .9-8.9A5.5 5.5 0 0 1 19 8a3.5 3.5 0 0 1-2 7z" /><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" /></>);
export const IconSnow = make(<><path d="M17 15H8a4.5 4.5 0 1 1 .9-8.9A5.5 5.5 0 0 1 19 8a3.5 3.5 0 0 1-2 7z" /><path d="M8 19h.01M12 20h.01M16 19h.01M10 22h.01M14 22h.01" /></>);
export const IconStorm = make(<><path d="M17 15H8a4.5 4.5 0 1 1 .9-8.9A5.5 5.5 0 0 1 19 8a3.5 3.5 0 0 1-2 7z" /><path d="m12 15-2 4h4l-2 4" /></>);
export const IconFog = make(<path d="M4 9h16M3 13h18M5 17h14" />);
export const IconPin = make(<><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>);
export const IconMosque = make(<><path d="M4 21V11a8 6 0 0 1 16 0v10M2 21h20M12 5V2M9 21v-4a3 3 0 0 1 6 0v4" /></>);
export const IconCommand = make(<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />);
export const IconImage = make(<><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>);
export const IconCode = make(<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16" />);
export const IconEdit = make(<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />);
export const IconLayers = make(<><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>);
export const IconLeaf = make(<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l7-7" />);
export const IconWifiOff = make(<><path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M14 10.3A10 10 0 0 1 19 13M2 9.5a15 15 0 0 1 4-2.6M12 20h.01" /></>);
export const IconHeart = make(<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />);
export const IconPinTop = make(<path d="M9 4h6l-1 5 3 3H7l3-3-1-5zM12 12v8" />);
export const IconDown = make(<path d="M12 5v14M6 13l6 6 6-6" />);
export const IconCheck = make(<path d="M5 12.5l4.5 4.5L19 7.5" />);
/** The Ora mark: an O that opens where a small sun rises. */
export function IconOra({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="38.9 6.3" transform="rotate(-20 12 12)" />
      <circle cx="17.1" cy="6.9" r="1.9" fill="#FFF1D6" />
    </svg>
  );
}
export const IconBell = make(<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />);
export const IconStar = make(<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" />);
export const IconRepeat = make(<path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4" />);
export const IconPlan = make(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M8.5 15l2.2 2.2 4.8-4.7" /></>);
export const IconTarget = make(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".6" /></>);
export const IconHelp = make(<><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7M12 16.8h.01" /></>);
export const IconUp = make(<path d="M12 19V5M6 11l6-6 6 6" />);
export const IconGrip = make(<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth={3} />);
export const IconMenu = make(<path d="M4 7h16M4 12h16M4 17h16" />);
export const IconCopy = make(<><rect x="8" y="8" width="12" height="12" rx="3" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>);
export const IconBook = make(<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /></>);
export const IconText = make(<path d="M5 7h14M5 12h14M5 17h9" />);
export const IconFolder = make(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />);
export const IconChat = make(<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />);
