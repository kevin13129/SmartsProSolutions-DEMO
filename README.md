# Smarts Pro Solutions - One-Pager & Built-In Price Calculator

> **"Clean Spaces. Happier & Healthier Lives."**  
> *Reliable • Professional • Detail Oriented*  
> Serving Shreveport, Bossier City, and Northwest Louisiana.

---

## 🌟 Overview

This is a modern, high-converting DEMO website built for **Smarts Pro Solutions**. The design incorporates the business's official branding, colors (vibrant sapphire blues, electric cyan, and fresh leaf green), typography, and service catalog as featured on their business card and brand assets.

The center of the experience is an **Interactive Instant Price Calculator** that enables prospective residential and commercial clients to configure their property specifications and receive a real-time, transparent estimate in under 60 seconds.

---

## 🚀 Key Features

### 1. Dynamic Instant Price Calculator
- **Property Details**:
  - **Bedrooms**: Interactive `-` / `+` stepper counter (0 to 10).
  - **Full Bathrooms**: Interactive `-` / `+` stepper counter (1 to 8).
  - **Half Bathrooms**: Interactive `-` / `+` stepper counter (0 to 6).
  - **Square Footage**: Linked interactive slider and direct numeric input (400 to 6,000+ sq ft).
- **Service Types**:
  - **Standard Clean** (1.0x baseline): Regular maintenance, sanitization, dusting, mopping, and vacuuming.
  - **Deep Clean** (1.45x multiplier): Detailed scrub, hand-wiped baseboards, grout, door trim, switch plates, and vents.
  - **Move-In / Move-Out Clean** (1.65x multiplier): Empty turnover cleaning, interior shelves, drawers, closets, and deposit-return preparation.
- **Recurring Frequency & Automatic Discounts**:
  - **Weekly**: **20% OFF** discount badge automatically deducted from the clean rate.
  - **Every 2 Weeks (Bi-Weekly)**: **15% OFF** discount badge ("Most Popular").
  - **Every 4 Weeks (Monthly)**: **10% OFF** discount badge.
  - **One-Time**: Standard rate with no recurring discount.
- **Custom Add-Ons (Exact Rates)**:
  - **Change Bed Linens**: **$5 each** (stepper counter).
  - **Inside Refrigerator**: **$50 each** (stepper counter).
  - **Inside Oven**: **$60 each** (stepper counter).
  - **Interior Windows**: **$3 each** (stepper counter).
- **Live Itemized Quote Card**:
  - Real-time animated price counter.
  - Breakdown of rooms, square footage, service tier, discount savings, and add-on subtotals.
  - Estimated cleaning duration & assigned specialist crew size.
  - **"Lock In Quote & Book Clean"** action button opening the booking inquiry modal.
  - **"Print Quote"** button triggering clean, print-optimized estimate invoices.
  - **"Share / Copy"** button generating an instant clipboard summary to text or email.

---

### 2. Full-Fledged One-Pager Content & Sections
- **Top Announcement Bar**: Direct click-to-call phone numbers (`(318) 564-4360`, `(318) 200-3782`) and Shreveport area badge.
- **Hero Section**: High-impact value proposition, trust badges (Licensed & Insured, 100% Satisfaction Guarantee), and hero visual with floating accolades.
- **Quick Glance Brand Strip**: Icon strip matching the 5 primary service areas from their card.
- **Interactive Price Calculator Section**: The primary interactive configurator.
- **Comprehensive Services Showcase**: Tabbed service gallery covering Residential, Commercial & Office, Deep Restorations, Move In/Out, and Industrial/Post-Construction.
- **Commercial & Industrial Spotlight**: Tailored section highlighting after-hours scheduling, OSHA compliance, bonded team, and custom facility scopes for Shreveport businesses.
- **What's Included Comparison Checklist**: Side-by-side room checklist comparing Standard vs Deep vs Move In/Out.
- **The Smarts Pro Difference**: 4 core pillars (Dependable, Detail-Oriented, Family & Pet Safe, Happiness Guarantee).
- **Customer Reviews**: Testimonials from local Shreveport and Bossier City homeowners and office managers.
- **Service Area Coverage**: Shreveport, Bossier City, Barksdale AFB, Benton, Haughton, Stonewall, Blanchard, Greenwood.
- **"Let's Get In Touch!" Contact Section**: Mirroring their business card layout with direct phone lines, email, address, and an inquiry form.

---

### 3. Backend Integration Framework (`assets/js/api.js`)
Prepared for immediate production rollout when the client pulls the trigger:
- **Client-Side Mock Persistence**: Submissions generate branded tracking codes (`SPS-#####`) and persist to browser storage.
- **Supabase Ready**: Pre-wired for Supabase table insertion (`quote_bookings`).
- **Webhook & CRM Ready**: Configurable webhook URL for Zapier, Make.com, or serverless endpoints.
- **Admin / Demo Leads Inspector**:
  - Accessible via the footer link **"⚡ Admin / Demo Leads View"** or by pressing **`Shift + L`**.
  - Displays all captured test leads in a clean table.
  - One-click **"Download CSV of Leads"** button.

---

## 📁 Project Structure

```text
SmartsProSolutions-DEMO/
├── assets/
│   ├── css/
│   │   └── styles.css          # Modern vanilla CSS with responsive design & print rules
│   ├── js/
│   │   ├── api.js              # Backend facade (Mock, Supabase & Webhook ready)
│   │   ├── calculator.js       # Live dynamic pricing formula engine
│   │   ├── booking-modal.js    # Modal controller & Leads Inspector
│   │   └── main.js             # Navigation, tabs, and form handlers
│   └── images/
│       ├── logo-transparent.png # High-res transparent brand logo
│       ├── logo-mark.png        # Icon mark favicon
│       ├── business-card-full.png # Original card asset
│       ├── hero-home.jpg        # Luxury clean residential interior
│       ├── commercial-office.jpg # Modern commercial facility interior
│       └── sparkle-kitchen.jpg  # Deep clean detail showcase
├── index.html                   # Semantic HTML5 single-page application
└── README.md                    # Documentation
```

---

## 💻 How to Run Locally

Because the project is built with clean modern HTML5, Vanilla CSS, and modular ES6 JavaScript, **no build step or compiler is required**:

### Option 1: Python HTTP Server (Already Running on Port 3000)
```powershell
python -m http.server 3000
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Option 2: Node / npx serve
```bash
npx -y serve -l 3000 .
```

### Option 3: Direct File Opening
Double-click `index.html` in File Explorer to open directly in Chrome, Edge, or Firefox.

---

## 🚢 Deployment Options

- **Vercel**: Deploy with zero configuration by connecting the GitHub repository.
- **Netlify / GitHub Pages**: Deploy the root folder as a static site.
- **Custom Domain**: Point `smartsprosolutions.com` or client domain via DNS.
