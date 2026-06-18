#!/usr/bin/env bash
set -e
cd /home/kaijage/model/maafa/dmis-platform/backend
export JAVA_HOME="$HOME/tools/jdk"
export PATH="$HOME/tools/jdk/bin:$HOME/tools/maven/bin:$PATH"
flock -w 600 /tmp/dmis-build.lock mvn -q -o package -DskipTests > /tmp/dmis-mvn.log 2>&1
echo "EXIT=$?" >> /tmp/dmis-mvn.log
