"""Envoi d'e-mails transactionnels (invitation du parent) via SMTP."""
from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage

from .settings import settings


class MailError(RuntimeError):
    pass


def smtp_configured() -> bool:
    return bool(settings.smtp_host and settings.mail_from)


def send_mail(to: str, subject: str, body: str) -> None:
    if not smtp_configured():
        raise MailError("aucun serveur d'envoi d'e-mails n'est configuré (SMTP_HOST, MAIL_FROM)")
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.mail_from, to, subject
    msg.set_content(body)
    try:
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, 465, context=ssl.create_default_context(), timeout=15) as s:
                if settings.smtp_user:
                    s.login(settings.smtp_user, settings.smtp_password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
                if settings.smtp_starttls:
                    s.starttls(context=ssl.create_default_context())
                if settings.smtp_user:
                    s.login(settings.smtp_user, settings.smtp_password)
                s.send_message(msg)
    except (OSError, smtplib.SMTPException) as exc:
        raise MailError(f"échec de l'envoi : {exc.__class__.__name__}") from exc


def parent_invitation(student_name: str, code: str) -> tuple[str, str]:
    link = f"{settings.public_url}/parent/inscription?code={code}"
    subject = f"{student_name} vous invite à valider son inscription — Orientation 4.0"
    body = (
        "Bonjour,\n\n"
        f"{student_name} utilise Orientation 4.0, la plateforme d'aide à l'orientation de son établissement, "
        "et vous a indiqué comme parent ou représentant légal.\n\n"
        "Pour valider son inscription, créez votre compte parent avec ce lien :\n"
        f"{link}\n\n"
        f"Code d'invitation : {code}\n\n"
        "Vous ne verrez que les informations que votre enfant choisira de partager avec vous. "
        "Si vous ne connaissez pas cet élève, ignorez simplement ce message.\n\n"
        "— L'équipe Orientation 4.0\n"
    )
    return subject, body
