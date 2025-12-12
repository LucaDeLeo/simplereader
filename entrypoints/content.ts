export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('SimpleReader content script loaded.');
  },
});
