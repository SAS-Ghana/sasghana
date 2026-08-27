import { useEffect } from "react";
import { observeBody } from "./lib/dom-enhancer";

type CalendarItem = {
  date: string;
  type: string;
  title: string;
  status: string;
  row: HTMLTableRowElement;
};
const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const calendarLabel = /^(calendar|calendrier|calendario|日历|kalenda)$/i;
function normalDate(value: string) {
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? "";
}
function keyForDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function readableDate(key: string) {
  const parsed = new Date(`${key}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return key;
  return parsed.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Preview what is booked on a day, in place.
 *
 * Clicking an entry used to switch the calendar out for the table and scroll to the matching row,
 * which meant losing the month you were looking at to read one booking. Each entry's own row is the
 * source of truth for the detail, so every cell of it is shown against its column heading rather
 * than just the four fields the grid chip carries.
 */
function openCalendarPreview(
  dateKey: string,
  items: CalendarItem[],
  onOpenInList?: () => void,
) {
  document.querySelector(".calendar-preview-backdrop")?.remove();

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop calendar-preview-backdrop";

  const modal = document.createElement("section");
  modal.className = "modal calendar-preview-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", `Bookings on ${readableDate(dateKey)}`);

  const close = () => {
    document.removeEventListener("keydown", onKeyDown);
    backdrop.remove();
  };
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") close();
  }

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "modal-close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", close);

  const eyebrow = document.createElement("span");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = `${items.length} ${items.length === 1 ? "entry" : "entries"}`;

  const heading = document.createElement("h2");
  heading.textContent = readableDate(dateKey);

  const list = document.createElement("div");
  list.className = "calendar-preview-list";

  const headings = Array.from(
    items[0]?.row.closest("table")?.querySelectorAll("thead th") ?? [],
  ).map((cell) => cell.textContent?.trim() ?? "");

  for (const item of items) {
    const entry = document.createElement("article");
    entry.className = "calendar-preview-entry";

    const title = document.createElement("strong");
    title.textContent = item.title || item.type || "Booking";

    const badge = document.createElement("span");
    badge.className = `status-pill ${item.status.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    badge.textContent = item.status || item.type;

    const head = document.createElement("div");
    head.className = "calendar-preview-entry-head";
    head.append(title, badge);
    entry.appendChild(head);

    const details = document.createElement("dl");
    Array.from(item.row.querySelectorAll("td")).forEach((cell, index) => {
      const value = cell.textContent?.trim();
      if (!value) return;
      const label = headings[index] || `Field ${index + 1}`;
      const term = document.createElement("dt");
      term.textContent = label;
      const definition = document.createElement("dd");
      definition.textContent = value;
      details.append(term, definition);
    });
    if (details.childElementCount) entry.appendChild(details);

    list.appendChild(entry);
  }

  const actions = document.createElement("div");
  actions.className = "form-actions";
  if (onOpenInList) {
    const openInList = document.createElement("button");
    openInList.type = "button";
    openInList.className = "secondary";
    openInList.textContent = "Open in list";
    openInList.addEventListener("click", () => {
      close();
      onOpenInList();
    });
    actions.appendChild(openInList);
  }
  const done = document.createElement("button");
  done.type = "button";
  done.className = "primary";
  done.textContent = "Close";
  done.addEventListener("click", close);
  actions.appendChild(done);

  modal.append(closeButton, eyebrow, heading, list, actions);
  backdrop.appendChild(modal);
  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener("keydown", onKeyDown);
  document.body.appendChild(backdrop);
  closeButton.focus();
}

export function EmployeeCalendarEnhancer() {
  useEffect(() => {
    function enhance() {
      const active = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          ".employee-module-tabs button.active",
        ),
      ).some((button) => calendarLabel.test(button.textContent?.trim() ?? ""));
      if (!active) return;
      const page = Array.from(
        document.querySelectorAll<HTMLElement>(".employee-record-page"),
      ).find((item) =>
        calendarLabel.test(item.querySelector("h2")?.textContent?.trim() ?? ""),
      );
      if (!page || page.dataset.calendarEnhanced === "true") return;
      const table = page.querySelector<HTMLTableElement>("table.data-table");
      if (!table) return;
      page.dataset.calendarEnhanced = "true";
      const originalToolbar =
        page.querySelector<HTMLElement>(".filter-toolbar");
      if (originalToolbar) originalToolbar.hidden = true;
      const items: Array<CalendarItem> = Array.from(
        table.querySelectorAll<HTMLTableRowElement>("tbody tr"),
      )
        .map((row) => {
          const cells = row.querySelectorAll("td");
          return {
            date: normalDate(cells[0]?.textContent?.trim() ?? ""),
            type: cells[1]?.textContent?.trim() ?? "",
            title: cells[2]?.textContent?.trim() ?? "",
            status: cells[3]?.textContent?.trim() ?? "",
            row,
          };
        })
        .filter((item) => Boolean(item.date));
      const shell = document.createElement("div");
      shell.className = "employee-calendar-shell";
      shell.innerHTML = `<div class="calendar-controls"><div class="calendar-view-toggle"><button type="button" class="active" data-view="calendar">Calendar</button><button type="button" data-view="list">List</button></div><input type="search" placeholder="Search events…" aria-label="Search calendar"><select aria-label="Filter event type"><option value="all">All event types</option></select><select aria-label="Sort calendar"><option value="asc">Oldest first</option><option value="desc">Newest first</option></select></div><div class="calendar-month-nav"><button type="button" data-move="-1" aria-label="Previous month">‹</button><button type="button" data-today>Today</button><strong></strong><button type="button" data-move="1" aria-label="Next month">›</button></div><div class="employee-calendar-grid" role="grid"></div>`;
      const head = page.querySelector(".panel-head");
      head?.insertAdjacentElement("afterend", shell);
      const types = Array.from(
        new Set(items.map((item) => item.type).filter(Boolean)),
      ).sort();
      const typeSelect = shell.querySelectorAll(
        "select",
      )[0] as HTMLSelectElement;
      for (const type of types) {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type;
        typeSelect.appendChild(option);
      }
      const queryInput = shell.querySelector("input") as HTMLInputElement;
      const sortSelect = shell.querySelectorAll(
        "select",
      )[1] as HTMLSelectElement;
      const grid = shell.querySelector(
        ".employee-calendar-grid",
      ) as HTMLElement;
      const tableWrap = page.querySelector(".table-scroll") as HTMLElement;
      let view: "calendar" | "list" = "calendar",
        month = new Date();
      month.setDate(1);
      function filtered() {
        const needle = queryInput.value.trim().toLowerCase(),
          type = typeSelect.value,
          sort = sortSelect.value;
        return items
          .filter(
            (item) =>
              (type === "all" || item.type === type) &&
              (!needle ||
                `${item.title} ${item.type} ${item.status}`
                  .toLowerCase()
                  .includes(needle)),
          )
          .sort(
            (a, b) => a.date.localeCompare(b.date) * (sort === "asc" ? 1 : -1),
          );
      }
      function renderList() {
        const visible = new Set(filtered().map((item) => item.row));
        for (const item of items) item.row.hidden = !visible.has(item.row);
        const tbody = table!.tBodies[0];
        for (const item of filtered()) tbody.appendChild(item.row);
      }
      function renderGrid() {
        grid.replaceChildren();
        for (const day of dayNames) {
          const label = document.createElement("div");
          label.className = "calendar-weekday";
          label.textContent = day;
          grid.appendChild(label);
        }
        const year = month.getFullYear(),
          monthIndex = month.getMonth(),
          first = new Date(year, monthIndex, 1),
          days = new Date(year, monthIndex + 1, 0).getDate(),
          offset = (first.getDay() + 6) % 7;
        for (let i = 0; i < offset; i++) {
          const blank = document.createElement("div");
          blank.className = "calendar-day outside";
          grid.appendChild(blank);
        }
        const visible = filtered();
        for (let day = 1; day <= days; day++) {
          const date = new Date(year, monthIndex, day),
            key = keyForDate(date),
            cell = document.createElement("div");
          cell.className = "calendar-day";
          if (key === keyForDate(new Date())) cell.classList.add("today");
          const number = document.createElement("strong");
          number.textContent = String(day);
          cell.appendChild(number);
          const dayItems = visible.filter((item) => item.date === key);
          if (dayItems.length) {
            // Clicking anywhere in a booked day previews everything on it, not just the chip.
            cell.classList.add("has-events");
            cell.setAttribute("role", "button");
            cell.tabIndex = 0;
            cell.setAttribute("aria-label", `${dayItems.length} entries on ${key}`);
            const preview = () => openCalendarPreview(key, dayItems);
            cell.addEventListener("click", preview);
            cell.addEventListener("keydown", (keyEvent) => {
              if (!["Enter", " "].includes(keyEvent.key)) return;
              keyEvent.preventDefault();
              preview();
            });
          }
          for (const item of dayItems) {
            const event = document.createElement("button");
            event.type = "button";
            event.className = `calendar-event type-${item.type.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            event.title = `${item.type}: ${item.title}`;
            const type = document.createElement("small");
            type.textContent = item.type;
            const title = document.createElement("span");
            title.textContent = item.title;
            event.append(type, title);
            event.addEventListener("click", (clickEvent) => {
              // Previously this jumped to the list and scrolled -- the entry was reachable but you
              // lost the calendar and still had to find the row. Show what is booked in place.
              clickEvent.stopPropagation();
              openCalendarPreview(keyForDate(date), [item], () => {
                view = "list";
                updateView();
                item.row.scrollIntoView({ behavior: "smooth", block: "center" });
              });
            });
            cell.appendChild(event);
          }
          grid.appendChild(cell);
        }
      }
      function updateView() {
        const calendar = view === "calendar";
        grid.hidden = !calendar;
        (shell.querySelector(".calendar-month-nav") as HTMLElement).hidden =
          !calendar;
        tableWrap.hidden = calendar;
        for (const button of shell.querySelectorAll<HTMLButtonElement>(
          "[data-view]",
        ))
          button.classList.toggle("active", button.dataset.view === view);
        const title = shell.querySelector(
          ".calendar-month-nav strong",
        ) as HTMLElement;
        title.textContent = month.toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
        });
        renderList();
        if (calendar) renderGrid();
      }
      shell
        .querySelectorAll<HTMLButtonElement>("[data-view]")
        .forEach((button) =>
          button.addEventListener("click", () => {
            view = button.dataset.view as "calendar" | "list";
            updateView();
          }),
        );
      shell
        .querySelectorAll<HTMLButtonElement>("[data-move]")
        .forEach((button) =>
          button.addEventListener("click", () => {
            month = new Date(
              month.getFullYear(),
              month.getMonth() + Number(button.dataset.move),
              1,
            );
            updateView();
          }),
        );
      shell
        .querySelector<HTMLButtonElement>("[data-today]")
        ?.addEventListener("click", () => {
          month = new Date();
          month.setDate(1);
          updateView();
        });
      queryInput.addEventListener("input", updateView);
      typeSelect.addEventListener("change", updateView);
      sortSelect.addEventListener("change", updateView);
      updateView();
    }
    enhance();
    // enhance() builds the calendar shell in place; the old rAF guard still fed those writes back
    // in on the next frame, so the pass repeated indefinitely once mounted.
    return observeBody(enhance, { label: "EmployeeCalendarEnhancer" });
  }, []);
  return null;
}
