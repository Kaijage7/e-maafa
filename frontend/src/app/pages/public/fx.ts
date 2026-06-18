import { Directive, ElementRef, Input, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Landing-page motion polish (reproduces the source page's behaviours):
 * - [fxCountUp]   — animates a number from 0 to its value when scrolled into view
 *                   (the source's data-count-to / animateStatCount).
 * - [fxReveal]    — fade-up on first scroll into view (the source's AOS fade-up).
 * Both use one IntersectionObserver and fire once.
 */
@Directive({ selector: '[fxCountUp]', standalone: true })
export class CountUpDirective implements OnInit, OnDestroy {
  @Input('fxCountUp') target: string | number = 0;
  @Input() fxSuffix = '';
  private el = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    this.observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        this.animate();
        this.observer?.disconnect();
      }
    }, { threshold: 0.4 });
    this.observer.observe(this.el.nativeElement);
  }

  private animate(): void {
    const to = Number(String(this.target).replace(/[^0-9.]/g, '')) || 0;
    const start = performance.now();
    const dur = 1400;
    const step = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic, same feel as the source
      this.el.nativeElement.textContent = Math.round(to * eased).toLocaleString() + this.fxSuffix;
      if (p < 1) { requestAnimationFrame(step); }
    };
    requestAnimationFrame(step);
  }

  ngOnDestroy(): void { this.observer?.disconnect(); }
}

@Directive({ selector: '[fxReveal]', standalone: true })
export class RevealDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    const node = this.el.nativeElement;
    node.style.opacity = '0';
    node.style.transform = 'translateY(24px)';
    node.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    this.observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        node.style.opacity = '1';
        node.style.transform = 'none';
        this.observer?.disconnect();
      }
    }, { threshold: 0.15 });
    this.observer.observe(node);
  }

  ngOnDestroy(): void { this.observer?.disconnect(); }
}
