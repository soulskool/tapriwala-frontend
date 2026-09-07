import type { IconType } from 'react-icons';
import {
  LuArmchair,
  LuArrowLeft,
  LuBell,
  LuBellOff,
  LuBookText,
  LuCamera,
  LuCheck,
  LuCheckCheck,
  LuChefHat,
  LuChevronDown,
  LuChevronUp,
  LuCircle,
  LuCircleDot,
  LuCircleX,
  LuClipboardCheck,
  LuClipboardList,
  LuClock,
  LuConciergeBell,
  LuDownload,
  LuFlame,
  LuGlassWater,
  LuHistory,
  LuInfo,
  LuLayoutDashboard,
  LuMenu,
  LuMinus,
  LuPrinter,
  LuReceiptText,
  LuSearch,
  LuShoppingBag,
  LuTrash2,
  LuTriangleAlert,
  LuUsers,
  LuUtensils,
  LuX,
} from 'react-icons/lu';

import { SERVICE_REQUEST_TYPE, type ServiceRequestType } from '@/lib/constants';

/**
 * Every icon the app draws, named once.
 *
 * Emoji used to do this job, and they were the wrong tool for a café: the same
 * character renders as a different picture on Android, iOS, and the Windows
 * tablet at the counter, some of them in a colour the design never chose, and a
 * few (🧾, 🍽) come out as an unreadable smudge at the 12px a status pill uses.
 * Line icons render identically everywhere and inherit `currentColor`, which is
 * what lets a status keep its own token colour.
 *
 * Imported by *meaning*, not by glyph. A screen asks for `IconWater`, so
 * swapping the drawing is one edit here rather than a hunt through twenty
 * files — the same reason statuses and socket events live in one module each.
 *
 * Lucide (`react-icons/lu`) throughout. Mixing icon sets is the fastest way to
 * make an interface look assembled rather than designed, so: one set, no
 * exceptions. Names are verified against the installed build — Lucide renamed
 * several between releases (`LuAlertTriangle` is `LuTriangleAlert` here).
 */

// ─── Actions ─────────────────────────────────────────────────────────────────

export const IconPrint = LuPrinter;
export const IconDownload = LuDownload;
/** Removing a line — a cancelled item, a cart row. Never a destructive "×". */
export const IconDelete = LuTrash2;
export const IconClose = LuX;
export const IconMenuToggle = LuMenu;
export const IconSearch = LuSearch;
export const IconBack = LuArrowLeft;
export const IconMinus = LuMinus;
export const IconExpand = LuChevronDown;
export const IconCollapse = LuChevronUp;

// ─── Meaning ─────────────────────────────────────────────────────────────────

export const IconCheck = LuCheck;
export const IconWarning = LuTriangleAlert;
export const IconInfo = LuInfo;
export const IconBill = LuReceiptText;
/** An open service request — a table waiting on a person, not on food. */
export const IconRequest = LuConciergeBell;
export const IconSoundOn = LuBell;
export const IconSoundOff = LuBellOff;
export const IconCamera = LuCamera;

// ─── Navigation ──────────────────────────────────────────────────────────────

export const IconFloor = LuUtensils;

/*
 * Dining / parcel. Both are always rendered next to their word, never alone:
 * the order type is a status, and rule 11 of the project brief is that colour
 * is never the only signal carrying one.
 */
export const IconDining = LuUtensils;
export const IconParcel = LuShoppingBag;
export const IconKitchen = LuChefHat;
export const IconBilled = LuBookText;
export const IconOverview = LuLayoutDashboard;
export const IconProducts = LuClipboardList;
export const IconTables = LuArmchair;
export const IconStaff = LuUsers;
export const IconAudit = LuHistory;

// ─── Status glyphs ───────────────────────────────────────────────────────────

/**
 * The non-colour channel on every status (§5).
 *
 * Each one has to be legible at 12px inside a pill, so they are shapes rather
 * than pictures: an empty ring, a filled dot, a clock, a flame, a tick.
 */
export const IconStatusEmpty = LuCircle;
export const IconStatusOccupied = LuCircleDot;
export const IconStatusPending = LuClock;
export const IconStatusAccepted = LuClipboardCheck;
export const IconStatusPreparing = LuFlame;
export const IconStatusReady = LuCheck;
export const IconStatusServed = LuCheckCheck;
export const IconStatusCancelled = LuCircleX;

// ─── Service requests ────────────────────────────────────────────────────────

/**
 * Icons for the three taps on a guest's phone.
 *
 * Lives here rather than in `lib/utils.ts` because these are React components
 * now, and that file is deliberately free of anything that cannot run during a
 * plain server render of a string.
 */
export const SERVICE_REQUEST_ICON: Record<ServiceRequestType, IconType> = {
  [SERVICE_REQUEST_TYPE.WATER]: LuGlassWater,
  [SERVICE_REQUEST_TYPE.CALL_STAFF]: LuConciergeBell,
  [SERVICE_REQUEST_TYPE.BILL]: LuReceiptText,
};

export type { IconType };
