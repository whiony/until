import { validDate, today, type Item } from "./domain";
export type FieldIssue = { field: string; message: string };
export function editorIssue(
  name: string,
  i: Item,
  ack: boolean,
): FieldIssue | null {
  if (!name.trim())
    return { field: "product-name", message: "Add a product name." };
  if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 9999)
    return {
      field: "item-quantity",
      message: "Enter a quantity from 1 to 9999.",
    };
  for (const [field, value] of [
    ["printed-date", i.printedDate],
    ["opened-date", i.openedDate],
    ["purchase-date", i.purchaseDate],
  ])
    if (value && !validDate(value))
      return { field, message: "Enter a valid date between 1900 and 2200." };
  if (i.openedDate > today())
    return {
      field: "opened-date",
      message: "Opening date cannot be in the future.",
    };
  if (
    i.purchaseDate > today() ||
    (i.purchaseDate && i.openedDate && i.purchaseDate > i.openedDate)
  )
    return {
      field: "purchase-date",
      message: "Purchase date must not be in the future or after opening.",
    };
  if (
    i.rule &&
    (!Number.isInteger(i.rule.amount) ||
      i.rule.amount < 1 ||
      i.rule.amount > 3650)
  )
    return {
      field: "opening-duration",
      message: "Enter a duration from 1 to 3650.",
    };
  if (i.printedDate && i.openedDate && i.printedDate < i.openedDate && !ack)
    return {
      field: "date-confirmation",
      message: "Confirm that you checked these dates.",
    };
  return null;
}
