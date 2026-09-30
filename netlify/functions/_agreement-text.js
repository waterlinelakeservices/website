// Waterline Lake Services customer agreement: the ONE place its wording lives.
//
// The signing page and the signed PDF are both built from this file by the
// server, so the text a customer sees and signs can't be altered in the browser.
// One agreement covers all of a customer's boats for the season. Sections marked
//   for: 'all'      apply to every boat
//   for: 'storage'  apply to boats on a storage package (Harbor, Flagship)
//   for: 'anchor'   apply to boats on the on-site package (Anchor)
// are included based on the packages of the boats being signed for; when a
// customer has both, both sets are included and labeled.
//
// To change the wording: edit below AND bump VERSION. Have counsel review changes.
// DRAFT v2 (2026-09-30): Anchor terms, property access, battery handling, and the
// freeze-protection commitment are new and have not yet had attorney review.

const VERSION = '2026-2027 v2';
const SEASON = '2026-2027';
const STORAGE_PACKAGES = ['Harbor', 'Flagship'];
const ANCHOR_PACKAGES = ['Anchor'];
const PACKAGES = ['Anchor', 'Harbor', 'Flagship'];
const PACKAGE_BLURB = {
  Anchor: 'Winterized at your own lift or property. Your boat stays with you.',
  Harbor: 'Picked up, winterized, and stored at our facility. Delivered back in spring.',
  Flagship: 'Everything in Harbor, plus shrink wrap, lift cover service, and a spring detail.',
};

const SECTIONS = [
  { for: 'all', h: 'Parties & Vessels', p: [
    { text: 'This Waterline Service Agreement ("Agreement") is entered into as of the date signed below (the "Effective Date"), by and between Waterline Lake Services, LLC, with a mailing address of 5421 S Poplar Dr, Columbus, IN 47201 ("Company" or "Waterline"), and the undersigned vessel owner ("Owner" or "Customer"). The vessel(s) covered by this Agreement, and the package chosen for each, are listed in the Schedule of Vessels that is part of this Agreement (each a "Vessel").' },
  ] },
  { for: 'all', h: 'Packages & Services', p: [
    { label: 'Packages:', text: 'Each Vessel is covered under the package shown for it in the Schedule of Vessels. Under the Anchor package, Company winterizes the Vessel at Owner\'s lift, dock, or property, and the Vessel stays there. Under the Harbor and Flagship packages, Company picks the Vessel up, winterizes it, stores it at Company\'s facility for the season, and returns it in the spring. Terms below labeled for a package apply only to Vessels on that package.' },
    { label: 'Services:', text: 'Company will perform the services on each Vessel described in Owner\'s accepted quote (for example, winterization, storage, and any add-ons agreed upon).' },
  ] },
  { for: 'all', h: 'Access to Owner\'s Property', p: [
    { label: 'Authorization.', text: 'Owner authorizes Company, its employees, and its agents to enter the property where each Vessel is kept (as described by Owner below), including driveways, yards, docks, boat lifts, and boathouses, at scheduled or reasonable times, to inspect, service, pick up, and deliver the Vessel as this Agreement requires. Owner represents that Owner owns the property or has the authority to grant this access.' },
    { label: 'Safe Access.', text: 'Owner will provide reasonably safe access, including a clear path to the Vessel and a lift and dock in working order, and will tell Company in advance about any hazards, pets, access codes, or special instructions. Company may reschedule if conditions are unsafe, including ice, high water, or severe weather.' },
    { label: 'Property Condition.', text: 'Company is not responsible for the existing condition of Owner\'s property, dock, lift, boathouse, or access route, or for ordinary wear from normal use in performing the services, except to the extent of damage caused by Company\'s negligence or willful misconduct.' },
  ] },
  { for: 'all', h: 'Batteries', p: [
    { text: 'As part of winterization, Company will disconnect each Vessel\'s battery or batteries. Owner has told Company in the Schedule of Vessels where each battery should be kept for the winter, and Company will follow that instruction. Disconnected batteries naturally lose charge over the winter. Unless Owner purchases a battery tender service, Company is not responsible for a battery\'s charge, condition, or replacement, and a battery left at Owner\'s property remains in Owner\'s care.' },
  ] },
  { for: 'all', h: 'Winterization & Freeze Protection', p: [
    { label: 'Purpose.', text: 'Company winterizes each Vessel to protect the engine and the systems included in Owner\'s service against freeze damage during the winter months.' },
    { label: 'Company\'s Commitment.', text: 'If a system Company winterized is damaged by freezing during the season because Company\'s winterization was not performed properly, Company will repair that freeze damage at its own cost, or reimburse the reasonable cost of repair by a repairer Company approves. This applies only if Owner reports the damage promptly and before the Vessel is used, run, or de-winterized by anyone other than Company, and gives Company a reasonable opportunity to inspect the Vessel.' },
    { label: 'Not Covered.', text: 'This commitment does not cover: systems or equipment Company did not winterize or that were not part of Owner\'s service; damage from water reintroduced after Company\'s service (for example, if the Vessel is run, used, launched, lowered into the water, or washed out, or takes on rain or snow melt because a cover was removed or failed); damage after the Vessel was moved or serviced by anyone other than Company; pre-existing cracks, leaks, or defects; or damage caused by lift, dock, or boathouse failure. This section is Company\'s only obligation for freeze damage and is subject to the Limitation of Liability section.' },
  ] },
  { for: 'all', h: 'Condition at Check-in', p: [
    { text: 'Owner has reviewed the condition report and photos Company recorded when each Vessel was checked in. Damage or conditions documented at check-in existed before Company\'s service and are not Company\'s responsibility.' },
  ] },

  // ---- storage packages (Harbor, Flagship) ----
  { for: 'storage', h: 'Storage Location', p: [
    { text: 'Company stores Vessels at the pole barn located at 8660 W 550S, Columbus, Indiana 47201 (the "Facility"), which Company leases from its own landlord.' },
  ] },
  { for: 'storage', h: 'Storage Term', p: [
    { label: 'Storage Season:', text: 'October 1, 2026 through April 30, 2027 (the "Storage Season"), matching the term of Company\'s own lease for the Facility.' },
    { label: 'Pickup:', text: 'Company will pick up the Vessel from Owner\'s property unless Owner delivers the Vessel to the Facility on or after October 1, 2026 (see Early Drop-off & Late Pick-up Charges for earlier storage).' },
    { label: 'Return:', text: 'Company will deliver the Vessel from the Facility on or before April 30, 2027 (see Early Drop-off & Late Pick-up Charges for later pick-up, and the Hard Deadline under Failure to Retrieve Vessel).' },
  ] },
  { for: 'storage', h: 'Early Drop-off & Late Pick-up Charges', p: [
    { label: 'Rate:', text: '$150.00 per month, or any partial month, for any period the Vessel is stored at the Facility before October 1, 2026, or after April 30, 2027. This charge is not further prorated by day.' },
    { label: 'Early Drop-off:', text: 'Owner shall request early drop-off at least 5 business days in advance. The early charge is due at drop-off or added to Owner\'s Storage Fee payment.' },
    { label: 'Late Pick-up:', text: 'Any Vessel remaining at the Facility after April 30, 2027 is billed the rate above for May 2027 (or partial month), subject to the Hard Deadline under Failure to Retrieve Vessel.' },
  ] },
  { for: 'storage', h: 'Bailment; Care, Custody, and Control', p: [
    { label: 'Bailment Created.', text: 'From the time Company takes the Vessel for transport to the Facility until Company returns it to Owner, Owner places the Vessel in Company\'s care, custody, and control for storage and the services described in this Agreement. This creates a bailment for mutual benefit between Owner (as bailor) and Company (as bailee). Company shall exercise reasonable care in the storage and handling of the Vessel, consistent with the standard of care customary in the boat storage and marine service industry.' },
    { label: 'Standard of Care; Not an Insurer.', text: 'Company is not an insurer of the Vessel. Company\'s obligation is to exercise reasonable care, not to guarantee the Vessel against loss or damage from any cause.' },
    { label: 'Personal Property.', text: 'This Agreement covers the Vessel and its permanently attached equipment only. Company is not responsible for loss of or damage to fuel, electronics, canvas or covers, or other personal property left on or in the Vessel, unless caused by Company\'s negligence or willful misconduct.' },
  ] },
  { for: 'storage', h: 'Visits to the Facility', p: [
    { text: 'The Facility is not generally open to Owner visits, and any visit must be prescheduled with Company. To the fullest extent permitted by Indiana law, Owner assumes the risk of, and releases Company from liability for, injury to Owner or Owner\'s guests while at the Facility, except to the extent caused by Company\'s negligence or willful misconduct.' },
  ] },
  { for: 'storage', h: 'Failure to Retrieve Vessel; Abandoned Property', p: [
    { label: 'Hard Deadline:', text: 'No Vessel may remain at the Facility after May 31, 2027, matching the hard deadline in Company\'s own lease for the Facility.' },
    { text: 'Any Vessel remaining after that date is a default under this Agreement. Company may relocate the Vessel to another storage location at Owner\'s expense, and/or treat the Vessel as abandoned and dispose of it at Owner\'s expense, subject to any written notice to Owner required by applicable Indiana law before disposal.' },
  ] },

  // ---- on-site package (Anchor) ----
  { for: 'anchor', h: 'On-site Service; No Storage', p: [
    { text: 'Company performs the services at Owner\'s lift, dock, or property. The Vessel stays there. Company does not take possession of, transport, or store the Vessel unless separately agreed in writing.' },
  ] },
  { for: 'anchor', h: 'Owner Keeps Care, Custody, and Control', p: [
    { text: 'Owner keeps care, custody, and control of the Vessel at all times. No bailment is created. Company is responsible only for its own negligence or willful misconduct while actively performing the services, and is not responsible for the Vessel before Company arrives or after Company completes the services.' },
  ] },
  { for: 'anchor', h: 'Lifts, Docks, and Site Conditions', p: [
    { text: 'Owner authorizes Company to operate Owner\'s lift as needed to perform the services. Owner is responsible for the condition, maintenance, and safe operation of the lift, dock, boathouse, canopy, and any cover. Company is not responsible for their failure unless caused by Company\'s negligence or willful misconduct.' },
  ] },
  { for: 'anchor', h: 'Winter Risks & Owner Responsibilities After Service', p: [
    { label: 'Risks.', text: 'After Company completes the services, Owner is responsible for the Vessel through the winter, including loss or damage from ice, snow load, wind, high water, lift or dock failure, rodents or other animals, theft, vandalism, and fire.' },
    { label: 'Owner Will:', text: 'keep the Vessel raised on its lift and out of the water, keep it covered and secured, and not run, use, launch, or wash out the Vessel without first telling Company, since doing so can undo the winterization.' },
    { label: 'Spring Service:', text: 'De-winterization and spring commissioning are not included unless purchased.' },
  ] },

  // ---- general terms ----
  { for: 'all', h: 'Fees & Payment', p: [
    { label: 'Fees:', text: 'Service fees, and for storage packages the Storage Fee, are the amounts in Owner\'s accepted quote or invoice.' },
    { label: 'Late Payment:', text: 'Any payment not received within 10 days of its due date is subject to a late charge of the greater of $50 or 1.5% of the unpaid balance per month.' },
    { label: 'Lien Rights:', text: 'For any Vessel in Company\'s possession, Company may refuse to release the Vessel until all amounts owed under this Agreement are paid, and shall have a lien on the Vessel for those amounts to the extent permitted by applicable Indiana law.' },
    { label: 'Cancellation:', text: 'If Owner cancels before the services begin, Company may retain a deposit or portion of the fees as a cancellation charge, as set out in the accepted quote; the remainder, if any, will be refunded.' },
  ] },
  { for: 'all', h: 'Owner\'s Insurance', p: [
    { text: 'Owner shall maintain, at Owner\'s own expense, Hull & Machinery insurance covering each Vessel for its full replacement or agreed value, and Watercraft Liability insurance with a minimum limit of $500,000 per occurrence, for the duration of this Agreement, including while the Vessel is at Owner\'s property.' },
    { for: 'storage', label: 'Stored Vessels:', text: 'Owner shall provide Company a certificate of insurance before or at the time a stored Vessel is picked up or delivered to the Facility, and shall name Company as an additional insured on the liability policy. Company may refuse to accept a Vessel for storage until a valid certificate is provided.' },
  ] },
  { for: 'all', h: 'Company\'s Insurance', p: [
    { text: 'Company shall maintain Commercial General Liability insurance with coverage of at least $1,000,000 per occurrence / $2,000,000 aggregate, and shall provide Owner a certificate of insurance upon request.' },
    { for: 'storage', label: 'Stored Vessels:', text: 'Company shall also maintain Bailee\'s Customers / Warehouse Legal Liability insurance (or equivalent garagekeepers-type coverage) sufficient to cover loss or damage to vessels in Company\'s care at the Facility, consistent with the insurance Company is required to carry under its own lease for the Facility.' },
  ] },
  { for: 'all', h: 'Limitation of Liability', p: [
    { text: 'Company shall not be liable for loss or damage to a Vessel arising from causes beyond Company\'s reasonable control, including fire, windstorm, high water, ice, or other acts of God, or theft or vandalism by third parties, except to the extent caused by Company\'s failure to exercise reasonable care. Company\'s liability for loss or damage to a Vessel caused by Company\'s ordinary negligence shall not exceed the actual cash value of the Vessel immediately before the loss, less Owner\'s applicable insurance deductible. Nothing in this Agreement limits Company\'s liability for its own gross negligence or willful misconduct.' },
  ] },
  { for: 'all', h: 'Indemnification', p: [
    { text: 'Owner shall defend, indemnify, and hold harmless Company and its employees and agents from any claims, damages, or expenses (including attorney\'s fees) arising from injury or property damage caused by the Vessel, Owner, or Owner\'s guests, or by conditions on Owner\'s property (including docks, lifts, pets, and hazards not disclosed to Company), except to the extent caused by Company\'s negligence or willful misconduct.' },
    { for: 'storage', label: 'Facility:', text: 'This also protects Company\'s landlord for the Facility from claims arising from a stored Vessel, Owner, or Owner\'s guests while at the Facility, except to the extent caused by Company\'s negligence or willful misconduct.' },
    { text: 'Company shall defend, indemnify, and hold harmless Owner from any claims, damages, or expenses arising from Company\'s negligence or willful misconduct.' },
  ] },
  { for: 'all', h: 'Assignment', p: [
    { text: 'Owner shall not assign this Agreement, in whole or in part, without Company\'s prior written consent.' },
  ] },
  { for: 'all', h: 'Notices', p: [
    { text: 'All notices under this Agreement shall be in writing and delivered by hand, certified mail, or email with confirmation of receipt, to the addresses on file (or such other address as a party designates in writing).' },
  ] },
  { for: 'all', h: 'Miscellaneous', p: [
    { label: 'Governing Law:', text: 'This Agreement shall be governed by and construed in accordance with the laws of the State of Indiana. Any action arising under this Agreement shall be brought in the state or federal courts located in Bartholomew County, Indiana. In any action to collect unpaid fees or enforce this Agreement, the prevailing party shall be entitled to recover its reasonable attorney\'s fees and costs.' },
    { label: 'Entire Agreement:', text: 'This Agreement constitutes the entire agreement between the parties regarding the services and storage of the Vessel(s) and supersedes all prior discussions or agreements, written or oral.' },
    { label: 'Amendment:', text: 'This Agreement may only be amended in a writing signed by both parties.' },
    { label: 'Severability:', text: 'If any provision of this Agreement is held invalid or unenforceable, the remaining provisions shall continue in full force and effect.' },
    { label: 'Force Majeure:', text: 'Neither party shall be liable for delay or failure to perform due to causes beyond its reasonable control (e.g., fire, severe weather, government order).' },
    { label: 'Electronic Signatures:', text: 'This Agreement may be signed electronically. Owner\'s electronic signature below is intended to have the same legal effect as a handwritten signature, and Owner consents to the use of electronic records for this Agreement under applicable law (including the U.S. ESIGN Act and Indiana\'s adoption of the Uniform Electronic Transactions Act).' },
  ] },
];

// Which set of terms a list of packages needs: 'storage', 'anchor', or 'both'.
function comboFor(packages) {
  const s = (packages || []).some((p) => STORAGE_PACKAGES.includes(p));
  const a = (packages || []).some((p) => ANCHOR_PACKAGES.includes(p));
  return s && a ? 'both' : a ? 'anchor' : 'storage';
}

// The numbered agreement for a combo. Package-specific sections are labeled when both apply.
function compose(combo) {
  const want = (f) => !f || f === 'all' || combo === 'both' || f === combo;
  const tag = { storage: 'Harbor & Flagship', anchor: 'Anchor' };
  const sections = SECTIONS.filter((s) => want(s.for)).map((s, i) => ({
    h: `${i + 1}. ${combo === 'both' && s.for !== 'all' ? tag[s.for] + ': ' : ''}${s.h}`,
    p: s.p.filter((p) => want(p.for)).map((p) => ({ label: p.label, text: p.text })),
  }));
  const title = combo === 'anchor' ? 'WATERLINE LAKE SERVICES ON-SITE WINTERIZATION AGREEMENT'
    : combo === 'both' ? 'WATERLINE LAKE SERVICES STORAGE & ON-SITE SERVICE AGREEMENT'
      : 'WATERLINE LAKE SERVICES STORAGE AGREEMENT';
  const subtitle = combo === 'anchor' ? 'On-site Winterization Service Agreement (Anchor package) — Columbus, Indiana 47201'
    : combo === 'both' ? 'Boat Storage and On-site Service Agreement (Anchor, Harbor, and Flagship packages) — Columbus, Indiana 47201'
      : 'Boat Storage and Service Agreement (Harbor and Flagship packages) — Columbus, Indiana 47201';
  return { title, subtitle, sections };
}

// Backward-compatible default (storage terms).
const AGREEMENT = compose('storage');

module.exports = { VERSION, SEASON, AGREEMENT, SECTIONS, PACKAGES, PACKAGE_BLURB, STORAGE_PACKAGES, ANCHOR_PACKAGES, comboFor, compose };
