import { createCn } from "cn/config"

/**
 * Class merging that knows our tokens (app/globals.css), so `cn("text-meta", "text-faint")` keeps
 * both: without this, custom sizes read as colours and the later one wins.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["hero", "title", "section", "note", "sketch", "lead", "body", "ui", "meta", "badge", "code"] }],
      shadow: [{ shadow: ["hair", "float", "note"] }],
      ease: [{ ease: ["paper"] }],
    },
  },
})
