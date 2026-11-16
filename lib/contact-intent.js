// Conservative triage, not client qualification. Ambiguous requests stay in the inbox.
function classifyContactIntent(message) {
  const text = String(message || "").normalize("NFKC").toLowerCase();
  const advisory = /\b(contract|claim|dispute|delay|fidic|arbitration|risk|advisory|advice|expert|litigation|variation|assessment)\b|عقد|عقود|مطالب|نزاع|مخاطر|استشار|تأخير|تاخير|تحكيم/.test(text);
  if (advisory) return "pending_review";
  const salesOffer = /\b(are you|looking for|seeking|we offer|we sell|we supply|our products|boost your|boost q[1-4]|grow your)\b|هل تبحث|نقدم لكم|نبيع|نورد لكم|منتجاتنا/.test(text);
  const unrelatedOffer = /\b(customers|sales|seo|backlinks|pvc windows?|window partner|web design|lead generation)\b|عملاء جدد|زيادة المبيعات|نوافذ|روابط خلفية/.test(text);
  return salesOffer && unrelatedOffer ? "suspected_solicitation" : "pending_review";
}

module.exports = { classifyContactIntent };
