/** NSW five-point achievement scale, shared by the report card PDF and
 *  the portal grid (importing the PDF template would drag
 *  @react-pdf/renderer into the client bundle). */
export const MARK_SCALE: Record<number, string> = {
  5: "Outstanding",
  4: "High",
  3: "Sound",
  2: "Basic",
  1: "Limited",
};
