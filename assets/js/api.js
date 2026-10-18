/**
 * SMARTS PRO SOLUTIONS - BACKEND INTEGRATION FRAMEWORK
 * Prepares scalable lead intake, booking management, and data persistence.
 * Currently runs in rapid local mock mode with full schema ready for Supabase or Webhook.
 */

(function () {
  'use strict';

  // Backend Integration Configuration
  const BACKEND_CONFIG = {
    // Mode options: 'mock' (local demo) | 'supabase' (Supabase DB) | 'webhook' (Zapier/Make/CRM)
    mode: 'mock',

    // Supabase credentials placeholder (ready when client provides project keys)
    supabase: {
      url: 'https://your-project.supabase.co',
      anonKey: 'your-anon-key',
      table: 'quote_bookings'
    },

    // Webhook or serverless endpoint (e.g. Vercel API / Zapier / Make.com)
    webhook: {
      url: ''
    }
  };

  const STORAGE_KEY = 'smartspro_leads_v1';

  /**
   * Generates a branded unique reference code (e.g., SPS-74892)
   */
  function generateReferenceCode() {
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    return `SPS-${randomDigits}`;
  }

  /**
   * Retrieves all leads stored in local mock DB
   */
  function getLeads() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('LocalStorage not accessible', e);
      return [];
    }
  }

  /**
   * Stores a new lead in local mock DB
   */
  function saveLead(lead) {
    const leads = getLeads();
    leads.unshift(lead);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
    } catch (e) {
      console.warn('Could not save lead to localStorage', e);
    }
    return lead;
  }

  /**
   * Main lead ingestion handler
   * @param {Object} formData Customer contact & schedule details
   * @param {Object} quoteData Active quote calculator parameters & totals
   * @returns {Promise<Object>} Booking confirmation result
   */
  async function submitBooking(formData, quoteData) {
    const refCode = generateReferenceCode();
    const timestamp = new Date().toISOString();

    const payload = {
      referenceCode: refCode,
      createdAt: timestamp,
      customer: {
        name: formData.name || '',
        phone: formData.phone || '',
        email: formData.email || '',
        address: formData.address || '',
        serviceDate: formData.date || '',
        preferredTime: formData.time || 'morning',
        specialInstructions: formData.notes || ''
      },
      quote: {
        bedrooms: quoteData.state.bedrooms,
        fullBaths: quoteData.state.fullBaths,
        halfBaths: quoteData.state.halfBaths,
        sqft: quoteData.state.sqft,
        serviceType: quoteData.state.serviceType,
        frequency: quoteData.state.frequency,
        addons: quoteData.state.addons,
        serviceSubtotal: quoteData.calculation.serviceSubtotal,
        discountAmount: quoteData.calculation.discountAmount,
        addonsTotal: quoteData.calculation.addonsTotal,
        grandTotal: quoteData.calculation.grandTotal,
        estimatedHours: quoteData.calculation.estTime,
        crewSize: quoteData.calculation.crewSize
      },
      status: 'pending_confirmation'
    };

    console.info('[SmartsProBackend] Processing new booking lead payload:', payload);

    // 1. Simulate network response delay
    await new Promise(resolve => setTimeout(resolve, 600));

    // 2. Persist in local demo store
    saveLead(payload);

    // 3. Webhook forwarding if configured
    if (BACKEND_CONFIG.webhook.url && BACKEND_CONFIG.mode === 'webhook') {
      try {
        await fetch(BACKEND_CONFIG.webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error('[SmartsProBackend] Webhook forward error:', err);
      }
    }

    // 4. Supabase forward hook (prepared for production client kickoff)
    if (BACKEND_CONFIG.mode === 'supabase' && window.supabase) {
      try {
        // e.g. await window.supabase.from(BACKEND_CONFIG.supabase.table).insert([payload]);
        console.info('[SmartsProBackend] Ready to execute Supabase insert.');
      } catch (err) {
        console.error('[SmartsProBackend] Supabase insert error:', err);
      }
    }

    // 5. Broadcast custom DOM event for third-party scripts/analytics
    window.dispatchEvent(new CustomEvent('smartspro:booking_submitted', { detail: payload }));

    return {
      success: true,
      referenceCode: refCode,
      lead: payload,
      message: 'Booking estimate request received successfully!'
    };
  }

  /**
   * Export all recorded leads as a CSV download for business owners
   */
  function exportLeadsCSV() {
    const leads = getLeads();
    if (!leads.length) {
      alert('No leads recorded yet in this session.');
      return;
    }

    const headers = ['Ref Code', 'Date Created', 'Customer Name', 'Phone', 'Email', 'Address', 'Service Type', 'Frequency', 'Total Estimate'];
    const rows = leads.map(l => [
      l.referenceCode,
      new Date(l.createdAt).toLocaleDateString(),
      `"${l.customer.name}"`,
      `"${l.customer.phone}"`,
      `"${l.customer.email}"`,
      `"${l.customer.address}"`,
      `"${l.quote.serviceType}"`,
      `"${l.quote.frequency}"`,
      `"$${l.quote.grandTotal.toFixed(2)}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SmartsPro_Leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Expose global API
  window.SmartsProBackend = {
    config: BACKEND_CONFIG,
    submitBooking,
    getLeads,
    exportLeadsCSV
  };

})();
