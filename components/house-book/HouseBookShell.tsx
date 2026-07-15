import "./house-book.css";

/**
 * Screen chrome + scoped-style wrapper for the public House Book routes.
 *
 * The wrapper class `.oraya-hb` carries the entire print palette and layout
 * system (components/house-book/house-book.css) so the book keeps the
 * approved light print look independent of the app theme. The toolbar is
 * screen-only and disappears in browser print ("Print / Save as PDF"
 * produces the 9-page A4 document).
 */
interface Props {
  villaName: string;   // "Villa Mechmech"
  villaHref: string;   // "/villas/mechmech"
  exploreHref: string; // "/explore/mechmech"
  children: React.ReactNode;
}

export default function HouseBookShell({ villaName, villaHref, exploreHref, children }: Props) {
  return (
    <div className="oraya-hb">
      <div className="oraya-hb-toolbar">
        <span>
          <a href={villaHref}>← {villaName}</a>
        </span>
        <span>
          The House Book · print with your browser for the A4 booklet ·{" "}
          <a href={exploreHref}>Living List</a>
        </span>
      </div>
      <div className="oraya-hb-pages">{children}</div>
    </div>
  );
}
