// The storage & service agreement customers sign at /agreement.
//
// This file is the ONLY source of the agreement wording. The signing page
// displays it, the signed PDF prints it, and its SHA-256 fingerprint is saved
// with every signature, so what the customer saw can always be proven.
//
// To change the wording for a new season: edit below AND bump VERSION.
// Past signatures keep their own PDF, version, and fingerprint.
//
// Copied word for word from the original agreements.waterlinelakeservices.com
// page (Sept 2026). Not legal advice: have counsel review changes.

const VERSION = '2026-2027 v1';
const SEASON = '2026-2027';

const AGREEMENT = {
 "title": "WATERLINE LAKE SERVICES STORAGE AGREEMENT",
 "subtitle": "Boat Storage and Service Agreement — Columbus, Indiana 47201",
 "sections": [
  {
   "h": "1. Parties & Vessel",
   "p": [
    {
     "text": "This Waterline Storage Agreement (\"Agreement\") is entered into as of the date signed below (the \"Effective Date\"), by and between Waterline Lake Services, LLC, with a mailing address of 5421 S Poplar Dr, Columbus, IN 47201 (\"Company,\" \"Waterline,\" or \"Facility\"), and the undersigned vessel owner (\"Owner\" or \"Customer\"), whose information and vessel(s) are listed in the signature section below."
    }
   ]
  },
  {
   "h": "2. Storage Location & Services",
   "p": [
    {
     "label": "Storage Location:",
     "text": "Company stores vessels at the pole barn located at 8660 W 550S, Columbus, Indiana 47201 (the \"Facility\"), which Company leases from its own landlord."
    },
    {
     "label": "Services:",
     "text": "In addition to storage, Company will perform the services on the Vessel(s) described in Owner's accepted quote (e.g., winterization, winter storage, and any other add-ons agreed upon)."
    }
   ]
  },
  {
   "h": "3. Storage Term",
   "p": [
    {
     "label": "Storage Season:",
     "text": "October 1, 2026 through April 30, 2027 (the \"Storage Season\"), matching the term of Company's own lease for the Facility."
    },
    {
     "label": "Drop-off:",
     "text": "Company will pick up the boat unless Owner delivers the Vessel to the Facility on or after October 1, 2026 (see Section 4 for earlier storage)."
    },
    {
     "label": "Pick-up:",
     "text": "Company shall deliver the Vessel from the Facility on or before April 30, 2027 (see Section 4 for later pick-up, and Section 11's Hard Deadline)."
    }
   ]
  },
  {
   "h": "4. Early Drop-off & Late Pick-up Charges",
   "p": [
    {
     "label": "Rate:",
     "text": "$150.00 per month, or any partial month, for any period the Vessel is stored at the Facility before October 1, 2026, or after April 30, 2027. This charge is not further prorated by day."
    },
    {
     "label": "Early Drop-off:",
     "text": "Owner shall request early drop-off at least 5 business days in advance. The early charge is due at drop-off or added to Owner's Storage Fee payment."
    },
    {
     "label": "Late Pick-up:",
     "text": "Any Vessel remaining at the Facility after April 30, 2027 is billed the rate above for May 2027 (or partial month), subject to the Hard Deadline in Section 11."
    }
   ]
  },
  {
   "h": "5. Storage & Service Fees",
   "p": [
    {
     "label": "Storage Fee:",
     "text": "The amount set out in Owner's accepted quote, due in full, covering storage of the Vessel(s) for the Storage Season described in Section 3."
    },
    {
     "label": "Service Fees:",
     "text": "billed separately per the estimate or invoice referenced in Section 2 for winterization, commissioning, or other maintenance work."
    },
    {
     "label": "Late Payment:",
     "text": "Any payment not received within 10 days of its due date is subject to a late charge of the greater of $50 or 1.5% of the unpaid balance per month. Company may refuse to release the Vessel until all outstanding Storage Fees, Service Fees, and late charges are paid in full."
    },
    {
     "label": "Lien Rights:",
     "text": "Company shall have a lien on the Vessel for all unpaid Storage Fees, Service Fees, and other charges owed under this Agreement, to the extent permitted by applicable Indiana law, and may retain possession of the Vessel until such amounts are paid in full."
    },
    {
     "label": "Cancellation:",
     "text": "If Owner cancels before the Vessel is delivered to the Facility, Company may retain a deposit or portion of the Storage Fee as a cancellation charge, as set out in the accepted quote; the remainder, if any, will be refunded."
    }
   ]
  },
  {
   "h": "6. Bailment; Care, Custody, and Control",
   "p": [
    {
     "label": "Bailment Created.",
     "text": "By agreeing to Company picking up the Vessel and transporting it to the Facility, Owner places the Vessel in Company's care, custody, and control for purposes of storage and the services described in Section 2. This Agreement creates a bailment for mutual benefit between Owner (as bailor) and Company (as bailee). Company shall exercise reasonable care in the storage and handling of the Vessel, consistent with the standard of care customary in the boat storage and marine service industry."
    },
    {
     "label": "Standard of Care; Not an Insurer.",
     "text": "Company is not an insurer of the Vessel. Company's obligation is to exercise reasonable care, not to guarantee the Vessel against loss or damage from any cause. Owner's and Company's respective insurance obligations are set out in Sections 7 and 8."
    },
    {
     "label": "Personal Property.",
     "text": "This Agreement covers the Vessel and its permanently attached equipment only. Company is not responsible for loss of or damage to fuel, batteries, electronics, canvas/covers, or other personal property left on or in the Vessel, unless caused by Company's negligence or willful misconduct."
    }
   ]
  },
  {
   "h": "7. Owner's Insurance (Backstop Coverage)",
   "p": [
    {
     "text": "Owner shall maintain, at Owner's own expense, Hull & Machinery insurance covering the Vessel for its full replacement or agreed value, and Watercraft Liability insurance with a minimum limit of $500,000 per occurrence, for the duration of this Agreement. Owner shall provide Company a certificate of insurance before or at the time the Vessel is delivered to the Facility, and shall name Company as an additional insured on the liability policy. Company may refuse to accept the Vessel for storage, or may suspend storage until a valid certificate is provided, if Owner fails to furnish or maintain this coverage."
    }
   ]
  },
  {
   "h": "8. Company's Insurance",
   "p": [
    {
     "text": "Company shall maintain (a) Commercial General Liability insurance with coverage of at least $1,000,000 per occurrence / $2,000,000 aggregate, and (b) Bailee's Customers / Warehouse Legal Liability insurance (or equivalent garagekeepers-type coverage) sufficient to cover loss or damage to vessels in Company's care at the Facility, consistent with the insurance Company is required to carry under its own lease for the Facility. Company shall provide Owner a certificate of insurance upon request."
    }
   ]
  },
  {
   "h": "9. Limitation of Liability",
   "p": [
    {
     "text": "Company shall not be liable for loss or damage to the Vessel arising from causes beyond Company's reasonable control, including fire, windstorm, high water, or other acts of God, or theft or vandalism by third parties, except to the extent caused by Company's failure to exercise reasonable care. Company's liability for loss or damage to the Vessel caused by Company's ordinary negligence shall not exceed the actual cash value of the Vessel immediately before the loss, less Owner's applicable insurance deductible under Section 7. Nothing in this Agreement limits Company's liability for its own gross negligence or willful misconduct."
    }
   ]
  },
  {
   "h": "10. Indemnification",
   "p": [
    {
     "text": "Owner shall defend, indemnify, and hold harmless Company, Company's landlord for the Facility, and their respective employees and agents, from any claims, damages, or expenses (including attorney's fees) arising from injury or property damage caused by the Vessel, Owner, or Owner's guests while at the Facility, except to the extent caused by Company's negligence or willful misconduct."
    },
    {
     "text": "Company shall defend, indemnify, and hold harmless Owner from any claims, damages, or expenses arising from Company's negligence or willful misconduct."
    },
    {
     "label": "Visits to the Facility.",
     "text": "The Facility is not generally open to Owner visits and any visit must be prescheduled with Company. To the fullest extent permitted by Indiana law, Owner assumes the risk of, and releases Company from liability for, injury to Owner or Owner's guests while at the Facility, except to the extent caused by Company's negligence or willful misconduct."
    }
   ]
  },
  {
   "h": "11. Failure to Retrieve Vessel; Abandoned Property",
   "p": [
    {
     "label": "Hard Deadline:",
     "text": "No Vessel may remain at the Facility after May 31, 2027, matching the hard deadline in Company's own lease for the Facility."
    },
    {
     "text": "Any Vessel remaining after that date is a default under this Agreement. Company may relocate the Vessel to another storage location at Owner's expense, and/or treat the Vessel as abandoned and dispose of it at Owner's expense, subject to any written notice to Owner required by applicable Indiana law before disposal."
    }
   ]
  },
  {
   "h": "12. Assignment",
   "p": [
    {
     "text": "Owner shall not assign this Agreement, in whole or in part, without Company's prior written consent."
    }
   ]
  },
  {
   "h": "13. Notices",
   "p": [
    {
     "text": "All notices under this Agreement shall be in writing and delivered by hand, certified mail, or email with confirmation of receipt, to the addresses on file (or such other address as a party designates in writing)."
    }
   ]
  },
  {
   "h": "14. Miscellaneous",
   "p": [
    {
     "label": "Governing Law:",
     "text": "This Agreement shall be governed by and construed in accordance with the laws of the State of Indiana. Any action arising under this Agreement shall be brought in the state or federal courts located in Bartholomew County, Indiana. In any action to collect unpaid fees or enforce this Agreement, the prevailing party shall be entitled to recover its reasonable attorney's fees and costs."
    },
    {
     "label": "Entire Agreement:",
     "text": "This Agreement constitutes the entire agreement between the parties regarding the storage and service of the Vessel(s) and supersedes all prior discussions or agreements, written or oral."
    },
    {
     "label": "Amendment:",
     "text": "This Agreement may only be amended in a writing signed by both parties."
    },
    {
     "label": "Severability:",
     "text": "If any provision of this Agreement is held invalid or unenforceable, the remaining provisions shall continue in full force and effect."
    },
    {
     "label": "Force Majeure:",
     "text": "Neither party shall be liable for delay or failure to perform due to causes beyond its reasonable control (e.g., fire, severe weather, government order)."
    },
    {
     "label": "Electronic Signatures:",
     "text": "This Agreement may be signed electronically. Owner's electronic signature below is intended to have the same legal effect as a handwritten signature, and Owner consents to the use of electronic records for this Agreement under applicable law (including the U.S. ESIGN Act and Indiana's adoption of the Uniform Electronic Transactions Act)."
    }
   ]
  }
 ]
};

module.exports = { VERSION, SEASON, AGREEMENT };
