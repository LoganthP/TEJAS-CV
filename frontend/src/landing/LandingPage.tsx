import React, { useState, useEffect, useCallback } from "react";
import "./landing.css";
import { ParticleField } from "./visuals/ParticleField";
import { ScanGrid } from "./visuals/ScanGrid";
import { Navbar } from "./sections/Navbar";
import { DotNav } from "./sections/DotNav";
import { HeroSection } from "./sections/HeroSection";
import { ProblemSection } from "./sections/ProblemSection";
import { SolutionSection } from "./sections/SolutionSection";
import { WorkflowSection } from "./sections/WorkflowSection";
import { ConceptSection } from "./sections/ConceptSection";
import { CapabilitiesSection } from "./sections/CapabilitiesSection";
import { ArchitectureSection } from "./sections/ArchitectureSection";
import { TechnologySection } from "./sections/TechnologySection";
import { InnovationSection } from "./sections/InnovationSection";
import { ImpactSection } from "./sections/ImpactSection";

const SECTIONS = [
  { id: "hero", label: "00 / Hero" },
  { id: "problem", label: "01 / The Problem" },
  { id: "solution", label: "02 / Our Solution" },
  { id: "workflow", label: "03 / Workflow" },
  { id: "concept", label: "04 / Concept" },
  { id: "capabilities", label: "05 / Capabilities" },
  { id: "architecture", label: "06 / Architecture" },
  { id: "technology", label: "07 / Technology" },
  { id: "innovation", label: "08 / Innovation" },
  { id: "impact", label: "09 / Impact" },
];

export const LandingPage: React.FC = () => {
  const [presenterMode, setPresenterMode] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<string>("hero");
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Smooth scroll helper
  const scrollToSection = useCallback((targetId: string) => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const offset = 70;
    const bodyRect = document.body.getBoundingClientRect().top;
    const elementRect = el.getBoundingClientRect().top;
    const elementPosition = elementRect - bodyRect;
    const offsetPosition = elementPosition - offset;

    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth",
    });
  }, []);

  // Show temporary toast feedback
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Toggle presenter mode
  const togglePresenterMode = useCallback(() => {
    setPresenterMode((prev) => {
      const next = !prev;
      triggerToast(
        next
          ? "Presenter Mode Active — Navigation hidden (Press 'P' to restore)"
          : "Presenter Mode Exited — Standard controls restored"
      );
      return next;
    });
  }, []);

  // Track scroll progress and active section via scroll listener
  useEffect(() => {
    const handleScroll = () => {
      const totalScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      if (totalScroll > 0) {
        setScrollProgress((window.scrollY / totalScroll) * 100);
      }

      const scrollPos = window.scrollY + window.innerHeight * 0.4;
      for (let i = SECTIONS.length - 1; i >= 0; i--) {
        const el = document.getElementById(SECTIONS[i].id);
        if (el && el.offsetTop <= scrollPos) {
          setActiveSection(SECTIONS[i].id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input, textarea, or contentEditable
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      // 'P' or 'p' key toggles Presenter Mode
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        togglePresenterMode();
        return;
      }

      // Escape key exits Presenter Mode
      if (e.key === "Escape" && presenterMode) {
        e.preventDefault();
        setPresenterMode(false);
        triggerToast("Presenter Mode Exited");
        return;
      }

      // Next / Previous section key bindings
      const isNext =
        e.key === "ArrowRight" ||
        e.key === "ArrowDown" ||
        e.key === "PageDown" ||
        e.key === " ";
      const isPrev =
        e.key === "ArrowLeft" ||
        e.key === "ArrowUp" ||
        e.key === "PageUp";

      if (isNext || isPrev) {
        e.preventDefault();
        const currentIndex = SECTIONS.findIndex((s) => s.id === activeSection);
        if (currentIndex === -1) return;

        if (isNext && currentIndex < SECTIONS.length - 1) {
          scrollToSection(SECTIONS[currentIndex + 1].id);
        } else if (isPrev && currentIndex > 0) {
          scrollToSection(SECTIONS[currentIndex - 1].id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSection, presenterMode, scrollToSection, togglePresenterMode]);

  return (
    <div
      className={`landing-root ${
        presenterMode ? "presenter-mode" : ""
      } bg-[#05070d] text-slate-100 min-h-screen relative selection:bg-cyan-500/30 selection:text-cyan-200`}
    >
      {/* Tricolour Scroll Progress Bar at the top of the viewport */}
      <div
        className="fixed top-0 left-0 h-[2.5px] z-50 transition-all duration-100 ease-out tricolor-hairline tricolor-hairline-glow"
        style={{ width: `${scrollProgress}%` }}
        aria-hidden="true"
      />

      {/* Background Visuals */}
      <ScanGrid />
      <ParticleField />

      {/* Sticky Navbar (fades out in presenter mode) */}
      <Navbar
        presenterMode={presenterMode}
        onTogglePresenter={togglePresenterMode}
      />

      {/* Right-edge Dot Navigator (fades out in presenter mode) */}
      <DotNav
        sections={SECTIONS}
        activeSection={activeSection}
        onSelect={scrollToSection}
      />

      {/* Toast Notification for Presenter Mode Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#0a1020]/95 border border-cyan-400/40 text-cyan-200 font-mono text-xs shadow-2xl backdrop-blur-md animate-fade-in flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* All Sections */}
      <main className="relative z-10 w-full pb-16 sm:pb-24">
        {/* 1. Hero */}
        <HeroSection onScrollTo={scrollToSection} />

        {/* 2. 01 / The Problem */}
        <ProblemSection />

        {/* 3. 02 / Our Solution */}
        <SolutionSection />

        {/* 4. 03 / Workflow */}
        <WorkflowSection />

        {/* 5. 04 / Prototype Concept */}
        <ConceptSection />

        {/* 6. 05 / Capabilities */}
        <CapabilitiesSection />

        {/* 7. 06 / Architecture */}
        <ArchitectureSection />

        {/* 8. 07 / Technology */}
        <TechnologySection />

        {/* 9. 08 / Innovation */}
        <InnovationSection />

        {/* 10. 09 / Impact */}
        <ImpactSection />
      </main>
    </div>
  );
};

export default LandingPage;
