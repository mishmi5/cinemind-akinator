export async function createCard(idToken: string): Promise<{ cardId: string }> {
  const res = await fetch('/api/cards', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create card');
  }

  return res.json();
}
