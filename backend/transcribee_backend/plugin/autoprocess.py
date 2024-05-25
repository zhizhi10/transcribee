import fnmatch
import mimetypes
import os
import shutil
import threading
import time
import yaml

import magic
from fastapi import UploadFile
from sqlmodel import select

from transcribee_backend import media_storage
from transcribee_backend.db import simple_get_session
from transcribee_backend.helpers.time import now_tz_aware
from transcribee_backend.models import Document, DocumentMediaFile, DocumentMediaTag, User
from transcribee_backend.routers.document import create_default_tasks_for_document

_configs = {}
_allowed_types = ["audio/*", "video/*", ".transcribee"]

def readconfig():
    with open( os.path.join(os.getcwd() ,"transcribee_backend","plugin",'auto-process-conf.yaml') ) as f:
        try:
            data = yaml.load(f, Loader=yaml.FullLoader)
            return data
        except Exception as e:
            print("----read config file error----")
            print(e)

def is_support_type(file_path, allowed_types):

    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type is None:
        return False
    for pattern in allowed_types:
        if fnmatch.fnmatch(mime_type, pattern):
            return True
    return False

def scan_files():
    current_dir = os.getcwd()
    income_dir = os.path.join(current_dir, "../income")
    if not os.path.exists(income_dir):
        os.makedirs(income_dir)
        os.chmod(income_dir, 0o777)
    files = os.listdir(income_dir)
    for file in files:
        if is_support_type(os.path.join(income_dir, file), _allowed_types):
            return os.path.join(income_dir, file)
    return None

def is_file_changing(file_path):
    now_size = os.path.getsize(file_path)
    time.sleep(1)
    latest_size = os.path.getsize(file_path)
    if now_size == latest_size:
        return False
    else:
        return True

def move_file(file_path):
    directory = os.path.dirname(file_path)
    destination_directory = os.path.join(directory, "processed")
    if not os.path.exists(destination_directory):
        os.makedirs(destination_directory)
        os.chmod(destination_directory, 0o777)
    destination_path = os.path.join(destination_directory, os.path.basename(file_path))
    shutil.move(file_path, destination_path)

def create_document(file_path):
    model = _configs["model"]
    language = _configs["language"]
    username = _configs["user"]
    number_of_speakers = _configs["number_of_speakers"]
    file_name = os.path.basename(file_path)
    name = os.path.splitext(file_name)[0]
    statement = select(User).where(User.username == username)
    session, = next(simple_get_session()),
    results = session.exec(statement)
    user = results.one_or_none()

    document = Document(
        name=name,
        user_id=user.id,
        created_at=now_tz_aware(),
        changed_at=now_tz_aware(),
    )
    session.add(document)
    local_file = open(file_path, "rb")
    file = UploadFile(local_file)

    move_file(file_path)

    stored_file = media_storage.store_file(file.file)
    file.file.seek(0)

    media_file = DocumentMediaFile(
        created_at=now_tz_aware(),
        changed_at=now_tz_aware(),
        document_id=document.id,
        file=stored_file,
        content_type=magic.from_descriptor(file.file.fileno(), mime=True),
    )

    session.add(media_file)

    tag = DocumentMediaTag(media_file_id=media_file.id, tag="original")
    session.add(tag)

    create_default_tasks_for_document(
        session, document, model, language, number_of_speakers
    )
    session.commit()

def start_auto_process():
    while True:
       file_path = scan_files()
       if file_path is None:
           time.sleep(2)
           continue

       if is_file_changing(file_path):
           time.sleep(2)
           continue

       print("Processing file: {}".format(file_path))
       create_document(file_path)


def auto_process():
    global _configs
    _configs = readconfig()
    thread = threading.Thread(target=start_auto_process)
    thread.daemon = True
    thread.start()
