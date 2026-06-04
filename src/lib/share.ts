export async function shareCard(url: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'CineMind',
        text: text,
        url: url
      });
      return 'shared';
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Share failed', e);
      }
      return 'failed';
    }
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch (e) {
    console.error('Clipboard failed', e);
    return 'failed';
  }
}
