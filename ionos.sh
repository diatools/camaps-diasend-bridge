#!/bin/bash

cd $HOME/nightscout

if test -d "camaps-diasend-bridge"; then
    echo "#########################\n"
    ehco "camaps-diasend-bridge is allready installed\n"
    echo "nothing to do ....\n"
    echo "GOOD BYE\n"
    echo "#########################\n"
else
    echo "CAMAPS=./camaps-diasend-bridge" >> .env
    echo "COMPOSE_FILE=docker-compose.yml:./camaps-diasend-bridge" >> .env

    git clone https://github.com/diatools/camaps-diasend-bridge.git camaps-diasend-bridge 
fi
