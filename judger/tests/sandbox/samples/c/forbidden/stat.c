#include <stdio.h>
#include <stdlib.h>

#include <netinet/in.h>
#include <sys/socket.h>
#include <sys/ptrace.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#include <sys/user.h>
#include <sys/reg.h>
#include <fcntl.h>
#include <pwd.h>
#include <sys/resource.h>
#include <errno.h>
#include <dirent.h>
#include <sys/stat.h>
#include <sys/types.h>

//https://stackoverflow.com/a/3138754/4839437
int main(){

  char *fd = "myfile.txt";
  struct stat *buf;
  buf = malloc(sizeof(struct stat));
  stat(fd, buf);

  int size = buf->st_size;
  printf("%d",size);

  return 0;
}