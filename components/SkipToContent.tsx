'use client';

/**
 * Skip link for keyboard/screen-reader users to bypass the repeated Navbar
 * links and jump straight to a page's main content. Visually hidden until
 * focused. Render this as the first child of the page body/layout, and add
 * `id="main-content"` to the page's main landmark.
 */
export default function SkipToContent({
  targetId = 'main-content',
}: {
  targetId?: string;
}) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:text-black focus:px-4 focus:py-2 focus:rounded focus:shadow-lg"
    >
      Skip to main content
    </a>
  );
}
