"""Public tuning diagnostics: fixed messages, never raw exception payloads."""

import re


def failure_reason(error):
    message = str(error)
    match = re.fullmatch(r'Model API returned HTTP (\d{3})', message)
    if match:
        status = match[1]
        hint = {'401': 'Check the backend API key.', '403': 'Check model access.',
                '404': 'Check CODEX_MODEL and model access.',
                '429': 'Check API quota and rate limits.'}.get(status, 'Retry or check the provider status.')
        return f'Model API returned HTTP {status}. {hint}'
    if 'benign_evaluation' in message:
        return 'Tuning policy is unsupported by this backend. Restart the backend to load the updated code.'
    if 'transport failed or timed out' in message:
        return 'The model request failed or timed out. Check backend network access and retry.'
    if 'label' in message.lower():
        return 'Evaluation labels are unavailable or invalid. Check the backend label store and dataset.'
    if 'No candidate passed' in message:
        return 'No candidate passed within three iterations. Review the proposal checks below and in Audit.'
    if 'n_sat' in message.lower() or 'window' in message.lower():
        return 'The proposal contains unsupported window or saturation settings. Review the saved rule validation checks.'
    if isinstance(error, OSError):
        return 'A backend file or database could not be accessed. Check backend storage permissions.'
    return f'Tuning failed ({type(error).__name__}). Check the backend setup and saved audit checks.'
