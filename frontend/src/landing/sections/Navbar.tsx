import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { LANDING_CONTENT } from "../content";
import { Tv, ArrowRight, UserCheck } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

interface NavbarProps {
  presenterMode: boolean;
  onTogglePresenter: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  presenterMode,
  onTogglePresenter,
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("hero");

  // Attempt to read current user status safely; if offline, catch silently
  let isSignedIn = false;
  try {
    const auth = useAuth();
    isSignedIn = Boolean(auth?.user);
  } catch {
    // If AuthProvider is unavailable or throws, fallback to signed out
    isSignedIn = false;
  }

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);

      // Track active section for navbar highlight
      const sections = LANDING_CONTENT.nav.links.map((l) => l.id);
      const scrollPosition = window.scrollY + 120;

      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i]);
        if (el && el.offsetTop <= scrollPosition) {
          setActiveSection(sections[i]);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    targetId: string
  ) => {
    e.preventDefault();
    const el = document.getElementById(targetId);
    if (el) {
      const offset = 80;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = el.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <header
      className={`nav-bar-wrapper fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#05070d]/85 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/40 py-2.5"
          : "bg-transparent py-4 border-b border-transparent"
      }`}
    >
      <div className="max-w-[1280px] mx-auto px-6 flex items-center justify-between">
        {/* Nav links */}
        <nav className="hidden lg:flex items-center gap-1 bg-white/[0.03] backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
          {LANDING_CONTENT.nav.links.map((link) => {
            const isActive = activeSection === link.id;
            return (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={(e) => handleNavClick(e, link.id)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
                  isActive
                    ? "bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-400/30 shadow-sm"
                    : "text-slate-300 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-3 ml-auto lg:ml-0">
          {/* Presenter Mode Toggle Button */}
          <button
            onClick={onTogglePresenter}
            title="Toggle Presenter Mode (Press 'P' on keyboard)"
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 hover:text-white text-xs transition-colors"
          >
            <Tv className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono text-[11px]">P</span>
          </button>

          {isSignedIn ? (
            /* Open Console Button (when signed in) */
            <Link
              to="/"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-semibold text-xs tracking-wide shadow-lg shadow-cyan-500/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{LANDING_CONTENT.nav.consoleBtn}</span>
            </Link>
          ) : (
            /* Log in (ghost) and Request access (solid cyan) */
            <div className="flex items-center gap-2.5">
              <Link
                to="/login"
                className="px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
              >
                {LANDING_CONTENT.nav.loginBtn}
              </Link>
              <Link
                to="/signup"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-xs tracking-wide shadow-md shadow-cyan-400/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <span>{LANDING_CONTENT.nav.signupBtn}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
