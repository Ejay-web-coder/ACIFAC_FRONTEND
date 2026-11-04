import { createContext, useContext, useEffect } from 'react';

// Lets a page put its own heading in the layout's top bar, like the member
// dashboard's "Welcome back, Ana" over the member ID, instead of the page name.
export interface PageHeading { title: string; subtitle?: string }

export const PageHeadingContext = createContext<(heading: PageHeading | null) => void>(() => undefined);

/** Shows `heading` in the top bar while the page is open; null keeps the page name. */
export function usePageHeading(heading: PageHeading | null) {
  const setHeading = useContext(PageHeadingContext);
  const title = heading?.title;
  const subtitle = heading?.subtitle;
  useEffect(() => {
    setHeading(title ? { title, subtitle } : null);
    return () => setHeading(null);
  }, [setHeading, title, subtitle]);
}
