"""Academic planning, syllabus intelligence, and retrieval."""

from .routes import install_academic_routes
from .service import AcademicService
from .store import AcademicStore, BlobAcademicStore

__all__ = ["AcademicService", "AcademicStore", "BlobAcademicStore", "install_academic_routes"]
