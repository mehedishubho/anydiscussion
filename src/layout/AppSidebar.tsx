"use client";
// src/layout/AppSidebar.tsx
// [CITED: 04-CONTEXT.md D-05 — role filter is UX ONLY; authoritative RBAC stays server-side]
// [CITED: CLAUDE.md "Roles & permissions" — never rely on UI hiding alone]
//
// The CMS dashboard sidebar. Owner request 260827-869 REMOVED the TailAdmin demo
// navigation (the "Components" showcase group and the Calendar entry) and
// unified settings into ONE section — this supersedes 04-CONTEXT D-02/D-03's
// preserve-the-showcase stance: the owner is now confident in the TailAdmin kit
// and explicitly asked for removal. The showcase routes, the calendar page, and
// their orphaned demo components were deleted together with the sidebar entries
// (no dangling imports).
//
// navItems     = the CMS top nav: Posts, Categories, Tags, Media, Pages, Users
//                (admin-only), Subscribers (admin-only). All hrefs are prefixed
//                `/dashboard/*` (D-01 — real CMS surfaces only).
// settingsItems = the flat Settings section: Storage / SEO / Backup / Newsletter
//                (all admin-only) + Profile (every role manages their own
//                profile — D-09 self-service, NO role gate).
//
// Role filter (D-05):
//   UX ONLY — every mutating Server Action still re-checks permissions server-side
//   (Phase 2 Pitfall #1, CLAUDE.md "never rely on UI hiding alone"). The `role`
//   prop is passed from `(admin)/layout.tsx` (AuthGate calls getSession) through
//   AdminShell. `hasRole(role, required)` returns true when either no role is
//   required OR the viewer's role matches the requirement (admin always passes).
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import BrandLogo from "@/components/common/BrandLogo";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";
import {
  BoxCubeIcon,
  BoxIcon,
  ChevronDownIcon,
  GridIcon,
  HorizontaLDots,
  ListIcon,
  PageIcon,
  PlugInIcon,
  UserCircleIcon,
  UserIcon,
} from "../icons/index";

type Role = "admin" | "editor" | "author";

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  subItems?: { name: string; path: string; pro?: boolean; new?: boolean }[];
  /**
   * UX-only role gate (D-05). When set, the item is hidden from roles that do
   * not match. `admin` always passes. Authoritative RBAC remains server-side.
   */
  requiredRole?: Role;
};

// ─── CMS top nav (D-02) ─────────────────────────────────────────────────────
const navItems: NavItem[] = [
  { icon: <GridIcon />, name: "Posts", path: "/dashboard/posts" },
  { icon: <ListIcon />, name: "Categories", path: "/dashboard/categories" },
  { icon: <BoxIcon />, name: "Tags", path: "/dashboard/tags" },
  { icon: <BoxCubeIcon />, name: "Media", path: "/dashboard/media" },
  { icon: <PageIcon />, name: "Pages", path: "/dashboard/pages" },
  {
    icon: <UserCircleIcon />,
    name: "Users",
    path: "/dashboard/users",
    requiredRole: "admin",
  },
  // 260824-3l2 — newsletter subscriber management (D-03). Admin surfaces
  // grouped after Users; ListIcon is already imported (no new icon). UX-only
  // gate — list/count/delete re-check requireRole('admin') FIRST server-side.
  {
    icon: <ListIcon />,
    name: "Subscribers",
    path: "/dashboard/subscribers",
    requiredRole: "admin",
  },
];

// ─── Settings section (owner request 260827-869 — one unified flat group) ───
// Direct links, NO submenu: the four admin-gated settings routes followed by
// the all-roles Profile entry. Per-item history comments carried over from the
// former Settings submenu + standalone Profile entry so provenance survives.
// Icons reuse the existing import set (PlugInIcon stays — reassigned from the
// removed Settings parent to Storage, the pluggable provider surface).
const settingsItems: NavItem[] = [
  // Plan 04-05 ships the Storage route; admin-gated (provider abstraction:
  // local default / R2 / Cloudinary). UX-only gate — the storage Server
  // Actions re-check requireRole('admin') FIRST server-side.
  {
    icon: <PlugInIcon />,
    name: "Storage",
    path: "/dashboard/settings/storage",
    requiredRole: "admin",
  },
  // Plan 05-03 shipped the SEO route (D-11); this entry closed the Phase 5 UAT
  // test 4 navigation gap (page was reachable by URL only). UX-only gate —
  // saveSeoSettings re-checks requireRole('admin') FIRST server-side.
  {
    icon: <PageIcon />,
    name: "SEO",
    path: "/dashboard/settings/seo",
    requiredRole: "admin",
  },
  // Plan 08-04 ships the Backup route; admin-only (BACKUP-05). UX-only gate — the Server
  // Actions re-check requireRole('admin') FIRST (CLAUDE.md "never rely on UI hiding alone").
  {
    icon: <BoxIcon />,
    name: "Backup",
    path: "/dashboard/settings/backup",
    requiredRole: "admin",
  },
  // 260824-3l2 — footer newsletter configuration (D-02). UX-only gate —
  // saveNewsletterSettings re-checks requireRole('admin') FIRST.
  {
    icon: <ListIcon />,
    name: "Newsletter",
    path: "/dashboard/settings/newsletter",
    requiredRole: "admin",
  },
  // D-09 self-service: every role manages their own profile — NO role gate
  // (the profile page + updateUser self-edit path are session-scoped, not
  // admin-gated; changeOwnPassword likewise self-resolves the session).
  { icon: <UserIcon />, name: "Profile", path: "/dashboard/profile" },
];

// ─── Role helpers (D-05 — UX ONLY) ──────────────────────────────────────────
/**
 * UX-only role gate. Admin always passes. The authoritative permission check
 * fires server-side in every mutating Server Action (Phase 2 Pitfall #1; this
 * sidebar filter is NOT a security boundary).
 */
function hasRole(role: Role | undefined, required: Role | undefined): boolean {
  if (!required) return true; // no requirement → visible to all
  if (!role) return false; // unknown viewer → hide role-restricted items
  if (role === "admin") return true; // admin = full (CLAUDE.md D-11)
  return role === required;
}

interface AppSidebarProps {
  /** Viewer's role, propagated from `(admin)/layout.tsx` AuthGate → AdminShell. */
  role?: Role;
}

const AppSidebar: React.FC<AppSidebarProps> = ({ role }) => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();

  // Active-item detection. Prefix match (e.g. `/dashboard/posts/new` lights up
  // the Posts entry) — required because the CMS nav points at section roots.
  const isActive = useCallback(
    (path: string) =>
      pathname === path || pathname.startsWith(path + "/"),
    [pathname],
  );

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main" | "others";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {},
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleSubmenuToggle = (index: number, menuType: "main" | "others") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  // Apply the UX-only role filter (D-05) once per render.
  const visibleNavItems = navItems.filter((item) => hasRole(role, item.requiredRole));
  const visibleSettingsItems = settingsItems.filter((item) =>
    hasRole(role, item.requiredRole),
  );

  const renderMenuItems = (
    items: NavItem[],
    menuType: "main" | "others",
  ) => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index, menuType)}
              className={`menu-item group  ${
                openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "lg:justify-start"
              }`}
            >
              <span
                className={` ${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className={`menu-item-text`}>{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200  ${
                    openSubmenu?.type === menuType &&
                    openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                href={nav.path}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className={`menu-item-text`}>{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      href={subItem.path}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {subItem.name}
                      <span className="flex items-center gap-1 ml-auto">
                        {subItem.new && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge `}
                          >
                            new
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge `}
                          >
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  useEffect(() => {
    // Auto-open the submenu containing the current path so the active item is
    // visible on first paint. Iterates the role-filtered lists.
    let submenuMatched = false;
    [
      { type: "main" as const, items: visibleNavItems },
      { type: "others" as const, items: visibleSettingsItems },
    ].forEach(({ type, items }) => {
      items.forEach((nav, index) => {
        if (nav.subItems) {
          nav.subItems.forEach((subItem) => {
            if (isActive(subItem.path)) {
              setOpenSubmenu({ type, index });
              submenuMatched = true;
            }
          });
        }
      });
    });
    if (!submenuMatched) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync open submenu to the active route on client-side navigation
      setOpenSubmenu(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, role]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex  ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link href="/dashboard">
          {isExpanded || isHovered || isMobileOpen ? (
            <BrandLogo />
          ) : (
            <BrandLogo wordmark={false} />
          )}
        </Link>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Menu"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(visibleNavItems, "main")}
            </div>

            <div className="">
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Settings"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(visibleSettingsItems, "others")}
            </div>
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
