"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface BookingCoverMedia {
  mechmech: string;
  byblos: string;
}

const BookingMediaContext = createContext<BookingCoverMedia>({ mechmech: "", byblos: "" });

export function BookingMediaProvider({
  children,
  media,
}: {
  children: ReactNode;
  media: BookingCoverMedia;
}) {
  return <BookingMediaContext.Provider value={media}>{children}</BookingMediaContext.Provider>;
}

export function useBookingMedia(): BookingCoverMedia {
  return useContext(BookingMediaContext);
}
