/* ==============================================================
   BroSafe — Project Details page
   File:     pages/project/project.js
   Rev:      0.4.0
   Updated:  2026-07-09
   Requires: core.js (SH.tabbedPage)
   --------------------------------------------------------------
   Page controller: declares sub-tabs only.
   ============================================================== */
SH.registerPage('project', SH.tabbedPage({
  title: 'Project Details',
  tabs: [
    { id: 'customer', label: 'Customer Details', src: 'pages/project/tabs/customer/customer.js' },
    { id: 'details', label: 'Project Details', src: 'pages/project/tabs/details/details.js' },
    { id: 'involved-parties', label: 'Involved Parties', src: 'pages/project/tabs/involved-parties/involved-parties.js' },
    { id: 'document-control', label: 'Document Control', src: 'pages/project/tabs/document-control/document-control.js' },
    { id: 'job-management', label: 'Job Management', src: 'pages/project/tabs/job-management/job-management.js' },
  ]
}));
