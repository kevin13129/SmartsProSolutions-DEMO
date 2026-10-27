# Additional Information Evaluation Step & Cross-Step Calculator Logic

Adds a mandatory **Additional Information** evaluation slide immediately after **Property Details** (making the residential/move/Airbnb flow a 5-step guided wizard), simplifies the monthly frequency option to **Monthly**, and synchronizes answers across steps—such as auto-adding the **$35 Pet Hair & Detailing** add-on when pets are present or disabling and greying out the pet add-on with an explanatory note when the customer selects **No Pets**.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following product and workflow decisions were confirmed during Phase 1 and govern the implementation:

- **Confirmed Decision 1 — Pricing Behavior of Additional Information**: Answers in the **Additional Information** step (`Last Professional Cleaning`, `Occupancy Status`, `Current Condition`) are recorded for the owner's review in the live summary, Estimate Review Modal, and Dispatch Envelope **without altering the base hourly calculation**.
- **Confirmed Decision 2 — Pets & $35 Pet Hair Add-On Sync**:
  - Choosing **Yes, we have pets** in **Additional Information** automatically sets the **Pet Hair & Detailing ($35)** add-on to `1` in the Add-Ons step (and keeps the add-on active).
  - Choosing **No Pets** in **Additional Information** resets the **Pet Hair & Detailing** add-on to `0`, disables its `+ / −` stepper controls, greys out the add-on card, and displays the note: `"You chose no pets in additional information"`.
- **Confirmed Decision 3 — Service Scope Routing**:
  - **Residential Homes**, **Move-In / Move-Out**, and **Airbnb / STR Turnover** use the 5-step sequence: `1. Type of Service` $\rightarrow$ `2. Property Details` $\rightarrow$ `3. Additional Information` $\rightarrow$ `4. Cleaning Frequency` $\rightarrow$ `5. Custom Add-Ons`.
  - **Commercial & Offices** retains its streamlined 2-step sequence (`1. Type of Service` $\rightarrow$ `2. Cleaning Frequency`) and skips property details, additional information, and residential add-ons.
- **Confirmed Decision 4 — Frequency Naming**: The frequency card previously labeled `Every 3 Wks` / `Every 4 Wks` is simplified to **Monthly** (`Once a Month`).

---

## 1. Overview & Core Concept

- **What It Does**: Introduces a dedicated **Step 3: Additional Information** slide inside the All-In-One Property Evaluation & Price Calculator tile so homeowners, tenants, and hosts provide essential context about pets, cleaning history, occupancy, and property condition before reaching frequency and add-ons.
- **Target Audience / Persona**: Homeowners, move-in/move-out clients, and Airbnb hosts in Shreveport & Bossier City calculating an instant cleaning estimate, as well as the Smarts Pro Solutions owner reviewing incoming job specs.
- **Key Value**: Gives the business owner complete property context before confirming a calendar hold while keeping the customer's step-by-step experience logical, consistent, and free of contradictory selections.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Step 1 — Type of Service**: Customer selects `Residential Homes`, `Commercial & Offices`, `Move-In / Move-Out`, or `Airbnb / STR Turnover`.
  2. **Step 2 — Property Details**: Customer configures Residential tier / specific areas or Move-In/Out property type (`House`, `Apartment`, `Condo`, `Townhome`) and room/square-footage gauges.
  3. **Step 3 — Additional Information (New Mandatory Slide)**:
     - Displays 4 structured required question groups styled with interactive checkable option cards:
       1. **Do you have pets?**
          - `Yes, we have pets`
          - `No pets`
       2. **When was the last professional cleaning?**
          - `Within the last month`
          - `1–3 months ago`
          - `4–6 months ago`
          - `More than 6 months ago`
          - `Never professionally cleaned`
          - `Unsure`
       3. **Will the home be occupied?**
          - `Occupied, we live there`
          - `Empty / Unfurnished`
          - `Partially Furnished`
       4. **How would you describe the current condition?**
          - `Well maintained`
          - `Average, normal use`
          - `Needs extra attention`
          - `Heavy buildup`
     - **Step Fulfillment Validation**: Clicking **Next** (or a later step tab) before answering all 4 questions blocks navigation, displays the validation alert banner listing what is missing, and highlights only the unanswered question group(s) with `.wizard-field-missing`.
  4. **Step 4 — Cleaning Frequency**:
     - Displays `Weekly`, `Every 2 Wks`, `Monthly` (updated from Every 3/4 Wks), `Per Turnover`, and `One Time`.
  5. **Step 5 — Custom Add-Ons (Cross-Step Sync)**:
     - If the user selected **No pets** in Step 3, the **Pet Hair & Detailing ($35)** card is visually greyed out (`.is-disabled-addon`), its stepper buttons are disabled, its quantity is locked at `0`, and a clear status note displays: `"You chose no pets in additional information"`.
     - If the user selected **Yes, we have pets** in Step 3, the **Pet Hair & Detailing ($35)** add-on is automatically set to `1` (`+$35.00`) and remains editable.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-trust regional service craftsmanship matching the existing navy, vibrant blue, and eco-green Smarts Pro Solutions design system.
  - *Color Palette & Mood*: Crisp `#FFFFFF` and `#F8FAFC` surfaces, `#0B2545` primary navy typography, `#0066CC` interactive selection rings, `#5EB133` confirmation accents, and `#94A3B8` / `#F1F5F9` muted states for disabled add-on cards.
  - *Typography & Hierarchy*: `Outfit` geometric headings for step headers and question titles paired with `Plus Jakarta Sans` for option labels and `tabular-nums` for all pricing metrics.
  - *Component Styling & Layout*: Checkable option pills/cards with a visible custom checkbox indicator (`✓`), responsive 2-column and 3-column desktop grids that collapse cleanly into touch-friendly rows on mobile viewports (`max-width: 768px`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Single-Choice Checkable Cards Per Question Group**:
  - *Chosen Approach*: Render each of the 4 Additional Information questions with custom checkbox-style cards where selecting an option checks its box and deselects competing options in that same question group.
  - *Why*: Matches the user's request for checkboxes while preventing contradictory states (such as selecting both "Empty / Unfurnished" and "Occupied, we live there" simultaneously).
- **Decision 2 — Granular Missing-Field Highlighting in Step 3**:
  - *Chosen Approach*: Validate each of the 4 questions individually when the customer attempts to advance from Step 3, highlighting only the specific question block(s) that have not been answered yet.
  - *Why*: With 4 required questions on one slide, highlighting only the unanswered group(s) lets the customer immediately spot what they missed without visual clutter.
- **Decision 3 — Automatic Pet Add-On Synchronization**:
  - *Chosen Approach*: Link `state.additionalInfo.hasPets` directly to `state.addons.pets` and the Pet Hair add-on card's disabled/enabled state.
  - *Why*: Ensures the estimate total and add-ons list stay 100% consistent with the customer's answer in Additional Information.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   CALCULATOR WIZARD STATE & VALIDATION ENGINE              │
│                                                                            │
│  ┌──────────────────────┐    ┌──────────────────────┐                      │
│  │ Step 1: Service Type │───▶│ Commercial Branch    │───▶ Step 4: Frequency│
│  └──────────┬───────────┘    │ (2-Step Sequence)    │     (Step 2 of 2)    │
│             │                └──────────────────────┘                      │
│             ▼ (Residential / Move-In-Out / Airbnb: 5-Step Sequence)        │
│  ┌──────────────────────┐                                                  │
│  │ Step 2: Property     │  • Residential Tiers ($40/$50/$120 Specific)     │
│  │         Details      │  • Move-In/Out Property Type (House/Apt/etc.)    │
│  └──────────┬───────────┘  • Bedrooms, Baths & Sq Ft Gauge                 │
│             │                                                              │
│             ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Step 3: Additional Information (All 4 Required to Advance)           │  │
│  │  1. Pets (Yes / No) ─────────────────┐                               │  │
│  │  2. Last Pro Cleaning (6 options)    │ Cross-Step State Sync         │  │
│  │  3. Occupancy Status (3 options)     │                               │  │
│  │  4. Current Condition (4 options)    │                               │  │
│  └──────────┬───────────────────────────┼───────────────────────────────┘  │
│             │                           │                                  │
│             ▼                           ▼                                  │
│  ┌──────────────────────┐    ┌──────────────────────────────────────────┐  │
│  │ Step 4: Cleaning     │───▶│ Step 5: Custom Add-Ons                   │  │
│  │         Frequency    │    │  • If Pets = "yes": Auto-set Pets = 1    │  │
│  │  (Weekly / Bi-Weekly │    │  • If Pets = "no": Lock Pets = 0, grey   │  │
│  │   / Monthly / etc.)  │    │    out card & show "You chose no pets    │  │
│  └──────────────────────┘    │    in additional information"            │  │
│                              └──────────────────┬───────────────────────┘  │
│                                                 │                          │
│                                                 ▼                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Live Quote Summary Card, Review Modal & SmartsProDispatchFramework   │  │
│  │  • Displays Property Condition / Occupancy / Pets / Last Clean       │  │
│  │  • Packages answers into Owner Review Dispatch Envelope              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - Extend `state` in the calculator engine with `additionalInfo`:
    - `hasPets`: `'' | 'yes' | 'no'`
    - `lastCleaned`: `'' | 'Within the last month' | '1-3 Months ago' | '4-6 months ago' | 'More than 6 months ago' | 'Never professionally cleaned' | 'Unsure'`
    - `occupancy`: `'' | 'Occupied, we live there' | 'Empty / Unfurnished' | 'Partially Furnished'`
    - `condition`: `'' | 'Well maintained' | 'Average, normal use' | 'Needs extra attention' | 'Heavy buildup'`
  - Update active step sequences:
    - Standard sequence (`residential`, `moveinout`, `airbnb`): `[1, 2, 3, 4, 5]` (5 steps total, with progress bar increments at `20%`, `40%`, `60%`, `80%`, `100%`).
    - Commercial sequence (`commercial`): `[1, 4]` (displayed as `Step 1 of 2: Type of Service` $\rightarrow$ `Step 2 of 2: Cleaning Frequency`).
- **Interactive Component & State Mapping**:
  - **Step 3 Option Selection**: Clicking any option button inside `#calc-step-3` updates the corresponding `state.additionalInfo` field, toggles `.active` and `aria-checked="true"` on the button, clears any `.wizard-field-missing` highlight on that group, and triggers pet add-on synchronization if the `hasPets` question was changed.
  - **Step 3 Validation**: `validateStepFulfillment(3)` checks `hasPets`, `lastCleaned`, `occupancy`, and `condition`. Any unanswered group receives `.wizard-field-missing` and `#wizard-validation-banner` lists the missing field(s).
  - **Step 5 Pet Add-On Lockout**: When `state.additionalInfo.hasPets === 'no'`, `#addon-item-pets` receives `.is-disabled-addon`, `#btn-pets-minus` and `#btn-pets-plus` are disabled, `state.addons.pets` is forced to `0`, and `#addon-pets-Lock-note` displays `"You chose no pets in additional information"`.
  - **Summary, Modal & Dispatch Groundwork**: The Live Quote Summary Card, Estimate Review Modal (`#booking-modal-overlay`), and `SmartsProDispatchFramework.buildJobEnvelope()` include the customer's Additional Information answers so the owner can review them alongside the property specs.
